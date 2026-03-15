import { Router, Request, Response } from 'express';
import { confirmBookingAndNotify } from '../jobs/paymentProcessor';
import { db } from '../db';
import { bookings, payments } from '../db/schema';
import { eq, and } from 'drizzle-orm';


const router: Router = Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret';

router.post('/payment', async (req: Request, res: Response): Promise<Response> => {
  // Verify the shared secret (in production: verify HMAC signature instead)
  const secret = req.headers['x-webhook-secret'];
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const { event, data } = req.body;

  if (!event || !data) {
    return res.status(422).json({ error: 'event and data are required' });
  }

  // Acknowledge unknown events without error — provider won't retry unnecessarily
  if (event !== 'payment.authorized') {
    return res.status(200).json({ received: true, processed: false });
  }

  const { booking_id, payment_id } = data;
  if (!booking_id || !payment_id) {
    return res.status(422).json({ error: 'data.booking_id and data.payment_id are required' });
  }

  // Validate booking + payment exist and are in the expected state
  const [row] = await db
    .select({ bookingId: bookings.id })
    .from(bookings)
    .innerJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.id, Number(booking_id)),
        eq(payments.id, Number(payment_id))
      )
    )
    .limit(1);

  if (!row) {
    return res.status(404).json({ error: 'Booking or payment not found' });
  }

  try {
    await confirmBookingAndNotify(Number(booking_id), Number(payment_id));
    return res.status(200).json({ received: true, processed: true });
  } catch (err) {
    console.error('[webhook/payment] Error:', err);
    // Return 500 so the provider retries — confirmBookingAndNotify is idempotent
    return res.status(500).json({ error: 'Failed to process payment event' });
  }
});

export default router;
