import { eq, inArray, sql, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { rooms, bookings, customers, staff, hotels } from '../db/schema';
import { BookingStatus, BookingAction, applyBookingAction } from '../utils/stateMachine';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret';
const JWT_EXPIRES_IN = '8h';

export class InvalidCredentialsError extends Error {}


export interface DashboardSummary {
  total_rooms: number;
  available: number;
  occupied: number;
  maintenance: number;
  out_of_service: number;
}

export interface BookingRow {
  id: number;
  roomNumber: string;
  customerName: string;
  customerEmail: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source: string;
  bookedByStaffName: string | null;
}

export interface RoomRow {
  id: number;
  roomNumber: string;
  floor: number;
  status: string;
  category: string;
  hotelId: number;
}

export interface BookingsPage {
  bookings: BookingRow[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardResult {
  hotelId: number;
  summary: DashboardSummary;
}

export class InvalidTransitionError extends Error {}
export class NotFoundError extends Error {}




export async function getDashboard(): Promise<DashboardResult> {
  const [hotel, roomSummary] = await Promise.all([
    db.select({ id: hotels.id }).from(hotels).limit(1),
    db.select({ status: rooms.status, count: sql<number>`count(*)::int` }).from(rooms).groupBy(rooms.status),
  ]);

  const summary = { total_rooms: 0, available: 0, occupied: 0, maintenance: 0, out_of_service: 0 };
  for (const row of roomSummary) {
    summary.total_rooms += row.count;
    if (row.status === 'available') summary.available = row.count;
    if (row.status === 'occupied') summary.occupied = row.count;
    if (row.status === 'maintenance') summary.maintenance = row.count;
    if (row.status === 'out_of_service') summary.out_of_service = row.count;
  }

  return { hotelId: hotel[0]?.id ?? 0, summary };
}

export async function getActiveBookings(page: number, limit: number): Promise<BookingsPage> {
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(inArray(bookings.status, [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN])),
    db.select({
        id: bookings.id,
        roomNumber: rooms.roomNumber,
        customerName: customers.name,
        customerEmail: customers.email,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
        source: bookings.source,
        bookedByStaffName: staff.name,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .leftJoin(staff, eq(bookings.bookedByStaffId, staff.id))
      .where(inArray(bookings.status, [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]))
      .orderBy(desc(bookings.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);
  return { bookings: rows, total: countResult[0]!.count, page, limit };
}

export async function getBookingHistory(page: number, limit: number): Promise<BookingsPage> {
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(inArray(bookings.status, [BookingStatus.CHECKED_OUT, BookingStatus.CANCELLED])),
    db.select({
        id: bookings.id,
        roomNumber: rooms.roomNumber,
        customerName: customers.name,
        customerEmail: customers.email,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
        source: bookings.source,
        bookedByStaffName: staff.name,
      })
      .from(bookings)
      .innerJoin(rooms, eq(bookings.roomId, rooms.id))
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .leftJoin(staff, eq(bookings.bookedByStaffId, staff.id))
      .where(inArray(bookings.status, [BookingStatus.CHECKED_OUT, BookingStatus.CANCELLED]))
      .orderBy(desc(bookings.id))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);
  return { bookings: rows, total: countResult[0]!.count, page, limit };
}


export async function checkInBooking(bookingId: number): Promise<typeof bookings.$inferSelect> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .for('update');

    if (existing.length === 0) throw new NotFoundError('Booking not found');

    const nextStatus = applyBookingAction(existing[0]!.status, BookingAction.CHECK_IN);
    if (!nextStatus) throw new InvalidTransitionError('Booking cannot be checked in at this stage');

    const [updated] = await tx
      .update(bookings)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    return updated!;
  });
}

export async function checkOutBooking(bookingId: number): Promise<typeof bookings.$inferSelect> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .for('update');

    if (existing.length === 0) throw new NotFoundError('Booking not found');

    const nextStatus = applyBookingAction(existing[0]!.status, BookingAction.CHECK_OUT);
    if (!nextStatus) throw new InvalidTransitionError('Booking cannot be checked out at this stage');

    const [updated] = await tx
      .update(bookings)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    await tx
      .update(rooms)
      .set({ status: 'available', updatedAt: new Date() })
      .where(eq(rooms.id, existing[0]!.roomId));

    return updated!;
  });
}

export async function cancelBooking(bookingId: number): Promise<typeof bookings.$inferSelect> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .for('update');

    if (existing.length === 0) throw new NotFoundError('Booking not found');

    const nextStatus = applyBookingAction(existing[0]!.status, BookingAction.CANCEL);
    if (!nextStatus) throw new InvalidTransitionError('Booking cannot be cancelled at this stage');

    const [updated] = await tx
      .update(bookings)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    await tx
      .update(rooms)
      .set({ status: 'available', updatedAt: new Date() })
      .where(eq(rooms.id, existing[0]!.roomId));

    return updated!;
  });
}

export async function loginStaff(email: string, password: string): Promise<{ token: string; staff: { id: number; name: string; role: string } }> {
  const [member] = await db
    .select({ id: staff.id, name: staff.name, email: staff.email, role: staff.role, hashedPassword: staff.hashedPassword })
    .from(staff)
    .where(eq(staff.email, email))
    .limit(1);

  if (!member) throw new InvalidCredentialsError('Invalid email or password');

  const valid = await bcrypt.compare(password, member.hashedPassword);
  if (!valid) throw new InvalidCredentialsError('Invalid email or password');

  const token = jwt.sign(
    { id: member.id, email: member.email, role: member.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return { token, staff: { id: member.id, name: member.name, role: member.role } };
}