import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { bookings, payments, rooms, customers } from '../db/schema';
import { sendBookingConfirmation } from '../services/notification';
import {
  BookingStatus,
  PaymentStatus,
  isValidBookingTransition,
  isValidPaymentTransition,
} from '../utils/stateMachine';

/**
 * Confirms a single booking+payment pair and sends a customer notification.
 *
 * This is called from two places:
 *  - The polling cron (fallback for missed webhook events)
 *  - The /api/webhooks/payment endpoint (primary, event-driven path)
 *
 * Because it is a standalone stateless function, any server instance can call
 * it without coordination — which is what makes the webhook approach
 * horizontally scalable. The cron, by contrast, would need distributed locking
 * (e.g. a Postgres advisory lock or Redis) if multiple instances ran it
 * simultaneously.
 *
 * The SELECT FOR UPDATE inside the transaction makes this idempotent:
 * if the booking is already CONFIRMED, the update is skipped silently.
 */
export async function confirmBookingAndNotify(bookingId: number, paymentId: number): Promise<void> {
  const confirmed = await db.transaction(async (tx) => {
    const [booking] = await tx
      .select({
        id: bookings.id,
        status: bookings.status,
        roomId: bookings.roomId,
        customerId: bookings.customerId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        totalPrice: bookings.totalPrice,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .for('update')
      .limit(1);

    // Already confirmed or booking does not exist — skip silently (idempotent)
    if (!booking) return null;
    if (!isValidBookingTransition(booking.status, BookingStatus.CONFIRMED)) return null;

    const [payment] = await tx
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment || !isValidPaymentTransition(payment.status, PaymentStatus.AUTHORIZED)) return null;

    await tx
      .update(payments)
      .set({ status: PaymentStatus.AUTHORIZED, processedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    await tx
      .update(bookings)
      .set({ status: BookingStatus.CONFIRMED, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));

    await tx
      .update(rooms)
      .set({ status: 'occupied', updatedAt: new Date() })
      .where(eq(rooms.id, booking.roomId));

    return booking;
  });

  if (!confirmed) return;

  // Fetch customer + room details for the notification (outside the transaction)
  const [detail] = await db
    .select({
      customerName: customers.name,
      customerEmail: customers.email,
      roomNumber: rooms.roomNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .innerJoin(rooms, eq(bookings.roomId, rooms.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (detail) {
    await sendBookingConfirmation({
      bookingId,
      customerName: detail.customerName,
      customerEmail: detail.customerEmail,
      roomNumber: detail.roomNumber,
      checkIn: confirmed.checkIn,
      checkOut: confirmed.checkOut,
      totalPrice: confirmed.totalPrice,
    });
  }
}

/**
 * Polls for unconfirmed bookings and confirms them.
 *
 * Acts as a safety net for bookings whose webhook event was missed or delayed.
 * With a reliable webhook in production, most bookings will already be
 * CONFIRMED before the cron runs.
 */
export async function processPayments(): Promise<void> {
  const pending = await db
    .select({ bookingId: bookings.id, paymentId: payments.id })
    .from(bookings)
    .innerJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, BookingStatus.PENDING_PAYMENT),
        eq(payments.status, PaymentStatus.PENDING_AUTHORIZATION)
      )
    );

  if (pending.length === 0) {
    console.log('[paymentProcessor] No pending payments.');
    return;
  }

  console.log(`[paymentProcessor] Processing ${pending.length} payment(s)...`);

  for (const row of pending) {
    try {
      await confirmBookingAndNotify(row.bookingId, row.paymentId);
      console.log(`[paymentProcessor] Booking ${row.bookingId} → CONFIRMED`);
    } catch (err) {
      console.error(`[paymentProcessor] Failed for booking ${row.bookingId}:`, err);
    }
  }
}

export function startPaymentProcessorCron(
  intervalMs = Number(process.env.PAYMENT_CRON_INTERVAL_MS) || 60_000,
): NodeJS.Timeout {
  console.log(`[paymentProcessor] Cron started — running every ${intervalMs / 1000}s`);
  processPayments().catch((err) => console.error('[paymentProcessor] Error:', err));
  return setInterval(() => {
    processPayments().catch((err) => console.error('[paymentProcessor] Error:', err));
  }, intervalMs);
}
