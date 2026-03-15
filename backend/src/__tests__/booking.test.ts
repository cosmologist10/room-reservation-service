import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './setup/app';
import {
  createBooking,
  getBookingsByEmail,
  DuplicateRequestError,
  BookingConflictError,
  NotFoundError,
} from '../services/booking';
import { requestOtp, verifyOtp, InvalidOtpError } from '../services/otp';

vi.mock('../services/booking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/booking')>();
  return {
    ...actual, // preserves real error classes for instanceof checks in routes
    createBooking: vi.fn(),
    getBookingsByEmail: vi.fn(),
  };
});

vi.mock('../services/otp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/otp')>();
  return {
    ...actual, // preserves InvalidOtpError class
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };
});

const app = createApp();

const VALID_BODY = {
  hotel_id: 1,
  room_id: 2,
  check_in: '2026-07-01',
  check_out: '2026-07-05',
  source: 'website',
  customer: { email: 'test@example.com', name: 'Test User' },
};

const MOCK_BOOKING_RESULT = {
  booking: {
    id: 1,
    status: 'PENDING_PAYMENT',
    checkIn: new Date('2026-07-01'),
    checkOut: new Date('2026-07-05'),
    totalPrice: '4800.00',
    source: 'website',
  },
  payment: { id: 1, status: 'pending_authorization', amount: '4800.00' },
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// POST /api/bookings
// ---------------------------------------------------------------------------
describe('POST /api/bookings', () => {
  it('returns 422 when Idempotency-Key header is missing', async () => {
    const res = await request(app).post('/api/bookings').send(VALID_BODY);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Idempotency-Key/i);
  });

  it('returns 422 when required body fields are missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'key-1')
      .set('X-OTP', '123456')
      .send({ hotel_id: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 422 for invalid source enum', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'key-2')
      .set('X-OTP', '123456')
      .send({ ...VALID_BODY, source: 'walk-in' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/source/i);
  });

  it('returns 422 when check_out is not after check_in', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'key-3')
      .set('X-OTP', '123456')
      .send({ ...VALID_BODY, check_in: '2026-07-05', check_out: '2026-07-01' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/check_out/i);
  });

  it('returns 201 with booking and payment on success', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockResolvedValue(MOCK_BOOKING_RESULT as any);

    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'key-ok')
      .set('X-OTP', '123456')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('PENDING_PAYMENT');
    expect(res.body.payment.status).toBe('pending_authorization');
  });

  it('calls createBooking with correctly parsed params', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockResolvedValue(MOCK_BOOKING_RESULT as any);

    await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'key-params')
      .set('X-OTP', '123456')
      .send(VALID_BODY);

    expect(vi.mocked(createBooking)).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 2,
        hotelId: 1,
        source: 'website',
        idempotencyKey: 'key-params',
        customer: expect.objectContaining({ email: 'test@example.com', name: 'Test User' }),
      })
    );
  });

  it('returns 409 with booking_id on duplicate idempotency key', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockRejectedValue(new DuplicateRequestError(42));

    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'dup-key')
      .set('X-OTP', '123456')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/duplicate/i);
    expect(res.body.booking_id).toBe(42);
  });

  it('returns 409 on room conflict (double booking)', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockRejectedValue(
      new BookingConflictError('Room not available for the selected dates')
    );

    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'conflict-key')
      .set('X-OTP', '123456')
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('returns 404 when hotel or room does not exist', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockRejectedValue(new NotFoundError('Hotel not found'));

    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'notfound-key')
      .set('X-OTP', '123456')
      .send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/bookings — reception flow (source: 'reception')
// ---------------------------------------------------------------------------
describe('POST /api/bookings — reception source', () => {
  const RECEPTION_BODY = {
    ...VALID_BODY,
    source: 'reception',
    booked_by_staff_id: 1,
  };

  const MOCK_RECEPTION_RESULT = {
    booking: {
      id: 2,
      status: 'CONFIRMED',
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-05'),
      totalPrice: '4800.00',
      source: 'reception',
    },
    payment: { id: 2, status: 'authorized', amount: '4800.00' },
  };

  it('returns 201 with CONFIRMED status for reception booking', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockResolvedValue(MOCK_RECEPTION_RESULT as any);

    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'reception-key-1')
      .set('X-OTP', '123456')
      .send(RECEPTION_BODY);

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('CONFIRMED');
    expect(res.body.payment.status).toBe('authorized');
  });

  it('calls createBooking with source reception and booked_by_staff_id', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(createBooking).mockResolvedValue(MOCK_RECEPTION_RESULT as any);

    await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'reception-key-2')
      .set('X-OTP', '123456')
      .send(RECEPTION_BODY);

    expect(vi.mocked(createBooking)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'reception',
        bookedByStaffId: 1,
      })
    );
  });

  it('returns 422 when source is reception but booked_by_staff_id is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'reception-key-3')
      .set('X-OTP', '123456')
      .send({ ...VALID_BODY, source: 'reception' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/booked_by_staff_id/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/bookings — lookup by email + OTP
// ---------------------------------------------------------------------------
describe('GET /api/bookings', () => {
  it('returns 422 when email query param is missing', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 422 when otp query param is missing', async () => {
    const res = await request(app).get('/api/bookings?email=test@example.com');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/otp/i);
  });

  it('returns 401 when OTP is invalid or expired', async () => {
    vi.mocked(verifyOtp).mockRejectedValue(new InvalidOtpError('Invalid or expired OTP'));

    const res = await request(app)
      .get('/api/bookings?email=test@example.com')
      .set('X-OTP', '000000');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns empty result when no bookings found for email', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(getBookingsByEmail).mockResolvedValue({
      bookings: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    const res = await request(app)
      .get('/api/bookings?email=unknown@example.com')
      .set('X-OTP', '123456');
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('returns bookings list with pagination metadata', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(getBookingsByEmail).mockResolvedValue({
      bookings: [
        {
          id: 1,
          roomNumber: '101',
          checkIn: new Date('2026-07-01'),
          checkOut: new Date('2026-07-05'),
          status: 'CONFIRMED',
          totalPrice: '4800.00',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const res = await request(app)
      .get('/api/bookings?email=test@example.com')
      .set('X-OTP', '123456');
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.bookings[0].roomNumber).toBe('101');
  });

  it('passes page and limit to the service', async () => {
    vi.mocked(verifyOtp).mockResolvedValue(undefined);
    vi.mocked(getBookingsByEmail).mockResolvedValue({ bookings: [], total: 0, page: 2, limit: 5 });

    await request(app)
      .get('/api/bookings?email=test@example.com&page=2&limit=5')
      .set('X-OTP', '123456');

    expect(vi.mocked(getBookingsByEmail)).toHaveBeenCalledWith('test@example.com', 2, 5);
  });
});

// ---------------------------------------------------------------------------
// POST /api/bookings/otp — request OTP
// ---------------------------------------------------------------------------
describe('POST /api/bookings/otp', () => {
  it('returns 422 when email is missing', async () => {
    const res = await request(app).post('/api/bookings/otp').send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 422 when email is invalid', async () => {
    const res = await request(app).post('/api/bookings/otp').send({ email: 'notanemail' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/email/i);
  });

  it('returns 200 and sends OTP for valid email', async () => {
    vi.mocked(requestOtp).mockResolvedValue({ sent: true });

    const res = await request(app)
      .post('/api/bookings/otp')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/otp sent/i);
    expect(vi.mocked(requestOtp)).toHaveBeenCalledWith('test@example.com');
  });
});
