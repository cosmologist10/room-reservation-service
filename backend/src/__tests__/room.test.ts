import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './setup/app';
import { getAvailableRooms, getRoomCategories } from '../services/rooms';

vi.mock('../services/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/rooms')>();
  return {
    ...actual,
    getAvailableRooms: vi.fn(),
    getRoomCategories: vi.fn(),
  };
});

const app = createApp();

const MOCK_ROOMS_RESULT = {
  rooms: [
    { id: 3, hotel_id: 1, category_id: 2, room_number: '201', floor: 2, status: 'available', category: 'Deluxe', base_price: '1200.00', capacity: 2 },
    { id: 5, hotel_id: 1, category_id: 3, room_number: '301', floor: 3, status: 'available', category: 'Suite', base_price: '2500.00', capacity: 4 },
  ],
  total: 2,
  page: 1,
  limit: 20,
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// GET /api/rooms/available
// ---------------------------------------------------------------------------
describe('GET /api/rooms/available', () => {
  it('returns 422 when check_in or check_out is missing', async () => {
    const res = await request(app).get('/api/rooms/available');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 422 for invalid date format', async () => {
    const res = await request(app).get(
      '/api/rooms/available?check_in=not-a-date&check_out=2026-07-05'
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/invalid date/i);
  });

  it('returns 422 when check_in is in the past', async () => {
    const res = await request(app).get(
      '/api/rooms/available?check_in=2020-01-01&check_out=2020-01-05'
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/check_in/i);
  });

  it('returns 422 when check_out is not after check_in', async () => {
    const res = await request(app).get(
      '/api/rooms/available?check_in=2026-07-10&check_out=2026-07-01'
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/check_out/i);
  });

  it('returns rooms with total and pagination metadata on valid request', async () => {
    vi.mocked(getAvailableRooms).mockResolvedValue(MOCK_ROOMS_RESULT as any);

    const res = await request(app).get(
      '/api/rooms/available?check_in=2026-07-01&check_out=2026-07-05'
    );
    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.rooms[0].room_number).toBe('201');
  });

  it('passes categoryId to the service when provided', async () => {
    vi.mocked(getAvailableRooms).mockResolvedValue({ ...MOCK_ROOMS_RESULT, rooms: [MOCK_ROOMS_RESULT.rooms[1]] } as any);

    const res = await request(app).get(
      '/api/rooms/available?check_in=2026-07-01&check_out=2026-07-05&categoryId=3'
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(getAvailableRooms)).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 3 })
    );
  });

  it('passes page and limit to the service', async () => {
    vi.mocked(getAvailableRooms).mockResolvedValue(MOCK_ROOMS_RESULT as any);

    await request(app).get(
      '/api/rooms/available?check_in=2026-07-01&check_out=2026-07-05&page=2&limit=5'
    );
    expect(vi.mocked(getAvailableRooms)).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/rooms/category
// ---------------------------------------------------------------------------
describe('GET /api/rooms/category', () => {
  it('returns list of categories', async () => {
    vi.mocked(getRoomCategories).mockResolvedValue([
      { id: 1, name: 'Standard' },
      { id: 2, name: 'Deluxe' },
    ]);

    const res = await request(app).get('/api/rooms/category');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Standard');
  });

  it('returns 500 when service throws', async () => {
    vi.mocked(getRoomCategories).mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/rooms/category');
    expect(res.status).toBe(500);
  });
});
