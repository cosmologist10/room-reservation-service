import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  createBooking,
  getBookingsByEmail,
  BookingConflictError,
  DuplicateRequestError,
  NotFoundError,
} from '../services/booking';
import { requestOtp, verifyOtp, InvalidOtpError } from '../services/otp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret';

function isStaffToken(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try { jwt.verify(authHeader.slice(7), JWT_SECRET); return true; } catch { return false; }
}

const router: Router = Router();

router.post('/otp', async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(422).json({ error: 'A valid email is required' });
  }
  try {
    const result = await requestOtp(email);
    if (!result.sent) {
      return res.json({
        message: 'An active OTP already exists',
        secondsRemaining: result.secondsRemaining,
      });
    }
    return res.json({ message: 'OTP sent' });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  const otp = req.headers['x-otp'] as string | undefined;
  const isStaff = isStaffToken(req.headers.authorization);

  if (!idempotencyKey) {
    return res.status(422).json({ error: 'Idempotency-Key header is required' });
  }
  if (!isStaff && !otp) {
    return res.status(422).json({ error: 'X-OTP header is required' });
  }

  const { room_id, hotel_id, check_in, check_out, source, booked_by_staff_id, customer } = req.body;

  if (!room_id || !hotel_id || !check_in || !check_out || !source || !customer?.email || !customer?.name) {
    return res.status(422).json({ error: 'room_id, hotel_id, check_in, check_out, source, and customer (email, name) are required' });
  }

  const validSources = ['website', 'third_party', 'reception'];
  if (!validSources.includes(source)) {
    return res.status(422).json({ error: 'source must be website, third_party, or reception' });
  }

  if (source === 'reception' && !booked_by_staff_id) {
    return res.status(422).json({ error: 'booked_by_staff_id is required for reception bookings' });
  }

  const checkIn = new Date(check_in);
  const checkOut = new Date(check_out);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return res.status(422).json({ error: 'Invalid date format, use YYYY-MM-DD' });
  }

  if (checkOut <= checkIn) {
    return res.status(422).json({ error: 'check_out must be after check_in' });
  }

  // Verify and consume OTP for customer bookings — staff skip this as they are authenticated via JWT
  if (!isStaff) {
    try {
      await verifyOtp(customer.email, otp!, true);
    } catch (err) {
      if (err instanceof InvalidOtpError) return res.status(401).json({ error: 'Invalid or expired OTP' });
      next(err);
      return;
    }
  }

  try {
    const result = await createBooking({
      roomId: Number(room_id),
      hotelId: Number(hotel_id),
      checkIn,
      checkOut,
      source,
      idempotencyKey,
      ...(booked_by_staff_id ? { bookedByStaffId: Number(booked_by_staff_id) } : {}),
      customer,
    });

    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof DuplicateRequestError) return res.status(409).json({ error: 'Duplicate request', booking_id: err.bookingId });
    if (err instanceof BookingConflictError) return res.status(409).json({ error: (err as Error).message });
    if (err instanceof NotFoundError) return res.status(404).json({ error: (err as Error).message });
    next(err);
  }
});

// OTP is read from the X-OTP header instead of a query param to avoid leaking
// it in server logs, browser history, and proxy access logs.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.query;
  const otp = req.headers['x-otp'] as string | undefined;

  if (!email || typeof email !== 'string') {
    return res.status(422).json({ error: 'email query parameter is required' });
  }
  if (!otp) {
    return res.status(422).json({ error: 'X-OTP header is required' });
  }

  try {
    await verifyOtp(email, otp);
  } catch (err) {
    if (err instanceof InvalidOtpError) return res.status(401).json({ error: (err as Error).message });
    next(err);
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

  try {
    return res.json(await getBookingsByEmail(email, page, limit));
  } catch (err) {
    next(err);
  }
});

export default router;
