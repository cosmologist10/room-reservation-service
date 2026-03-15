import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { rooms, roomCategories, bookings } from '../db/schema';

export interface AvailabilityParams {
  checkIn: Date;
  checkOut: Date;
  categoryId?: number;
  page?: number;
  limit?: number;
}

export interface AvailabilityResult {
  rooms: AvailableRoom[];
  total: number;
  page: number;
  limit: number;
}

export interface AvailableRoom {
  id: number;
  hotel_id: number;
  category_id: number;
  room_number: string;
  floor: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  category: string;
  base_price: string;
  capacity: number;
}


export interface RoomCategories {
  name: string,
  id: number
}


export async function getAvailableRooms(params: AvailabilityParams): Promise<AvailabilityResult> {
  const { checkIn, checkOut, categoryId, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const categoryClause = categoryId ? sql` AND r.category_id = ${categoryId}` : sql``;

  const whereClause = sql`
    r.status = 'available'
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.room_id = r.id
      AND b.status IN ('CONFIRMED', 'CHECKED_IN')
      AND b.check_in < ${checkOut}
      AND b.check_out > ${checkIn}
    )
    ${categoryClause}
  `;

  const [countResult, rowsResult] = await Promise.all([
    db.execute(sql`SELECT count(*)::int as total FROM rooms r WHERE ${whereClause}`),
    db.execute(sql`
      SELECT r.*, rc.name as category, rc.base_price, rc.capacity
      FROM rooms r
      JOIN room_categories rc ON r.category_id = rc.id
      WHERE ${whereClause}
      ORDER BY r.room_number
      LIMIT ${limit} OFFSET ${offset}
    `),
  ]);

  const total = (countResult.rows[0] as any).total as number;

  return {
    rooms: rowsResult.rows.map(row => ({
      id:          row.id          as number,
      hotel_id:    row.hotel_id    as number,
      category_id: row.category_id as number,
      room_number: row.room_number as string,
      floor:       row.floor       as number,
      status:      row.status      as string,
      created_at:  row.created_at  as Date,
      updated_at:  row.updated_at  as Date,
      category:    row.category    as string,
      base_price:  row.base_price  as string,
      capacity:    row.capacity    as number,
    })),
    total,
    page,
    limit,
  };
}

export async function getRoomCategories(): Promise<RoomCategories[]>{
  const res = await db
  .selectDistinct({ name: roomCategories.name, id: roomCategories.id })
  .from(roomCategories)
  .where(eq(roomCategories.isActive, true))
  .orderBy(roomCategories.name)
  return res;
}

