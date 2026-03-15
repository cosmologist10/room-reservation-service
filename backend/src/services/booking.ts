import { and, eq, lt, gt, ne, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { bookings, payments, customers, rooms, roomCategories, hotels } from '../db/schema';
import { BookingStatus, PaymentStatus } from '../utils/stateMachine';

export interface CreateBookingParams {
  roomId: number;
  hotelId: number;
  checkIn: Date;
  checkOut: Date;
  source: 'website' | 'third_party' | 'reception';
  idempotencyKey: string;
  bookedByStaffId?: number;
  customer: {
    email: string;
    name: string;
    phone?: string;
  };
}

export class BookingConflictError extends Error {}
export class DuplicateRequestError extends Error {
  constructor(public bookingId: number) {
    super('Duplicate request');
  }
}
export class InvalidTransitionError extends Error {}
export class NotFoundError extends Error {}

export interface CreateBookingResult {
  booking: typeof bookings.$inferSelect;
  payment: typeof payments.$inferSelect;
}

export interface Customer {
  email: string
  name: string
  phone?: string
}


type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function get_or_create_customer(tx: Tx, customer: Customer): Promise<number> {
    // INSERT ... ON CONFLICT DO UPDATE is atomic — eliminates the read-then-write
    // race condition where two concurrent first-time bookings for the same email
    // would both SELECT (find nothing) then both INSERT, causing a unique violation.
    const [result] = await tx
        .insert(customers)
        .values({ email: customer.email, name: customer.name, phone: customer.phone })
        .onConflictDoUpdate({ target: customers.email, set: { updatedAt: new Date() } })
        .returning({ id: customers.id });
    if (!result) throw new Error('Failed to upsert customer');
    return result.id;
}


async function lockRoomAndGetPrice(tx: Tx, roomId: number, checkIn: Date, checkOut: Date): Promise<string> {
    const roomLock = await tx
        .select({ basePrice: roomCategories.basePrice })
        .from(rooms)
        .innerJoin(roomCategories, eq(rooms.categoryId, roomCategories.id))
        .where(eq(rooms.id, roomId))
        .for('update')
        .limit(1);

    if (roomLock.length === 0) throw new NotFoundError('Room not found');

    const conflict = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
            and(
                eq(bookings.roomId, roomId),
                lt(bookings.checkIn, checkOut),
                gt(bookings.checkOut, checkIn),
                ne(bookings.status, BookingStatus.CANCELLED)
            )
        )
        .limit(1);

    if (conflict.length > 0) throw new BookingConflictError('Room not available for the selected dates');

    return roomLock[0]!.basePrice;
}

function calculateTotalPrice(basePrice: string, checkIn: Date, checkOut: Date): string {
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    return (parseFloat(basePrice) * nights).toFixed(2);
}

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
    const { roomId, hotelId, checkIn, checkOut, source, idempotencyKey, bookedByStaffId, customer } = params;

    const hotel = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
    if (hotel.length === 0) throw new NotFoundError('Hotel not found');

    const existing = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.idempotencyKey, idempotencyKey))
        .limit(1);

    if (existing.length > 0) throw new DuplicateRequestError(existing[0]!.id);

    try {
        return await db.transaction(async (tx) => {
            const customerId = await get_or_create_customer(tx, customer);
            const basePrice = await lockRoomAndGetPrice(tx, roomId, checkIn, checkOut);
            const totalPrice = calculateTotalPrice(basePrice, checkIn, checkOut);

            // Reception bookings are paid on the spot — skip the payment queue and
            // confirm immediately. Online bookings start as PENDING_PAYMENT and are
            // confirmed by the cron/webhook once payment is authorized.
            const isReception = source === 'reception';
            const bookingStatus = isReception ? BookingStatus.CONFIRMED : BookingStatus.PENDING_PAYMENT;
            const paymentStatus = isReception ? PaymentStatus.AUTHORIZED : PaymentStatus.PENDING_AUTHORIZATION;

            const [booking] = await tx
                .insert(bookings)
                .values({ roomId, hotelId, customerId, checkIn, checkOut, source, idempotencyKey, totalPrice, status: bookingStatus, ...(bookedByStaffId ? { bookedByStaffId } : {}) })
                .returning();
            if (!booking) throw new Error('Failed to insert booking');

            const [payment] = await tx
                .insert(payments)
                .values({ bookingId: booking.id, amount: totalPrice, status: paymentStatus, processedAt: isReception ? new Date() : null })
                .returning();
            if (!payment) throw new Error('Failed to insert payment');

            if (isReception) {
                await tx.update(rooms).set({ status: 'occupied' }).where(eq(rooms.id, roomId));
            }

            return { booking, payment };
        });
    } catch (err: any) {
        if (err?.code === '23505' && err?.constraint?.includes('idempotency')) {
            throw new DuplicateRequestError(existing[0]?.id ?? 0);
        }
        throw err;
    }
}

export interface GetBookingResult {
  booking: {
    id: number;
    status: string;
    checkIn: Date;
    checkOut: Date;
    totalPrice: string;
    source: string;
    customer: { name: string; email: string };
    room: { id: number; roomNumber: string; floor: number };
    payment: { id: number | null; status: string | null; amount: string | null };
  };
}

export interface CustomerBookingsPage {
  bookings: {
    id: number;
    roomNumber: string;
    checkIn: Date;
    checkOut: Date;
    status: string;
    totalPrice: string;
  }[];
  total: number;
  page: number;
  limit: number;
}

export async function getBookingsByEmail(email: string, page: number, limit: number): Promise<CustomerBookingsPage> {
  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (customer.length === 0) return { bookings: [], total: 0, page, limit };

  const customerId = customer[0]!.id;

  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.customerId, customerId)),
    db.select({
        id: bookings.id,
        roomNumber: rooms.roomNumber,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
        totalPrice: bookings.totalPrice,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(bookings.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);

  return { bookings: rows, total: countResult[0]!.count, page, limit };
}

export async function getBookingById(bookingId: number): Promise<GetBookingResult> {
  const result = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      totalPrice: bookings.totalPrice,
      source: bookings.source,
      customerName: customers.name,
      customerEmail: customers.email,
      roomNumber: rooms.roomNumber,
      roomFloor: rooms.floor,
      roomId: rooms.id,
      paymentId: payments.id,
      paymentStatus: payments.status,
      paymentAmount: payments.amount,
    })
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .innerJoin(rooms, eq(bookings.roomId, rooms.id))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (result.length === 0) throw new NotFoundError('Booking not found');

  const row = result[0]!;
  return {
    booking: {
      id: row.id,
      status: row.status,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      totalPrice: row.totalPrice,
      source: row.source,
      customer: { name: row.customerName, email: row.customerEmail },
      room: { id: row.roomId, roomNumber: row.roomNumber, floor: row.roomFloor },
      payment: { id: row.paymentId, status: row.paymentStatus, amount: row.paymentAmount },
    },
  };
}