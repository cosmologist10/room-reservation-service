import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './src/db';
import { hotels, roomCategories, rooms, staff, customers, bookings, payments } from './src/db/schema';
import { BookingStatus, PaymentStatus, BookingStatusType, PaymentStatusType } from './src/utils/stateMachine';

const FLOORS = 50;

async function seed() {
  console.log('Seeding database...');

  // 1. Hotel
  const [hotel] = await db.insert(hotels).values({
    name: 'Hotel Finago',
    address: 'Oslo, Norway',
    isActive: true,
  }).returning();
  console.log(`Hotel: id=${hotel.id}`);

  // 2. Room categories
  const [standard, deluxe, suite] = await db.insert(roomCategories).values([
    { hotelId: hotel.id, name: 'Standard', description: 'Cozy room with city view',          basePrice: '80.00',  capacity: 2 },
    { hotelId: hotel.id, name: 'Deluxe',   description: 'Spacious room with fjord view',     basePrice: '120.00', capacity: 2 },
    { hotelId: hotel.id, name: 'Suite',    description: 'Luxury suite with private terrace', basePrice: '250.00', capacity: 4 },
  ]).returning();
  console.log(`Categories: ${standard.id}, ${deluxe.id}, ${suite.id}`);

  // 3. Rooms — 500 rooms across 50 floors (10 per floor)
  // Category: Standard floors 1-30, Deluxe 31-45, Suite 46-50
  const roomValues: typeof rooms.$inferInsert[] = [];
  for (let floor = 1; floor <= FLOORS; floor++) {
    const categoryId = floor <= 30 ? standard.id : floor <= 45 ? deluxe.id : suite.id;
    for (let pos = 1; pos <= 10; pos++) {
      const roomNumber = `${floor}${String(pos).padStart(2, '0')}`;
      roomValues.push({ hotelId: hotel.id, categoryId, roomNumber, floor, status: 'available' });
    }
  }

  const insertedRooms = await db.insert(rooms).values(roomValues).returning();
  console.log(`Rooms created: ${insertedRooms.length}`);

  // 4. Staff — password for both accounts is 'password123'
  const hashedPassword = await bcrypt.hash('password123', 10);
  const [receptionist, manager] = await db.insert(staff).values([
    { hotelId: hotel.id, email: 'reception@hotelfinago.no', name: 'Anna Larsen',  role: 'receptionist', hashedPassword },
    { hotelId: hotel.id, email: 'manager@hotelfinago.no',   name: 'Erik Solberg', role: 'manager',       hashedPassword },
  ]).returning();
  console.log(`Staff: ${receptionist.name}, ${manager.name}`);

  // 5. Customers — 50 unique customers
  const customerValues: typeof customers.$inferInsert[] = Array.from({ length: 50 }, (_, i) => ({
    email: `customer${i + 1}@example.com`,
    name: `Customer ${i + 1}`,
    phone: `+47${String(10000000 + i).padStart(8, '0')}`,
  }));
  const insertedCustomers = await db.insert(customers).values(customerValues).returning();
  console.log(`Customers: ${insertedCustomers.length}`);

  // 6. Bookings — 100 bookings: CONFIRMED 20, CHECKED_IN 15, CHECKED_OUT 40, CANCELLED 25
  const statusPlan: Array<{ status: BookingStatusType; count: number; roomStatus: 'occupied' | 'available'; paymentStatus: PaymentStatusType }> = [
    { status: BookingStatus.CONFIRMED,   count: 20, roomStatus: 'occupied',  paymentStatus: PaymentStatus.AUTHORIZED },
    { status: BookingStatus.CHECKED_IN,  count: 15, roomStatus: 'occupied',  paymentStatus: PaymentStatus.CAPTURED   },
    { status: BookingStatus.CHECKED_OUT, count: 40, roomStatus: 'available', paymentStatus: PaymentStatus.CAPTURED   },
    { status: BookingStatus.CANCELLED,   count: 25, roomStatus: 'available', paymentStatus: PaymentStatus.REFUNDED   },
  ];

  const sources = ['website', 'third_party', 'reception'] as const;
  const baseDate = new Date('2026-01-01');

  let bookingIndex = 0;

  for (const { status, count, roomStatus, paymentStatus } of statusPlan) {
    for (let i = 0; i < count; i++) {
      const room = insertedRooms[bookingIndex];
      const customer = insertedCustomers[bookingIndex % insertedCustomers.length];
      const source = sources[bookingIndex % sources.length];

      const checkIn = new Date(baseDate);
      checkIn.setDate(baseDate.getDate() + bookingIndex * 3);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkIn.getDate() + 2 + (bookingIndex % 5));

      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
      const pricePerNight = room.categoryId === standard.id ? 800 : room.categoryId === deluxe.id ? 1200 : 2500;
      const totalPrice = (pricePerNight * nights).toFixed(2);

      const [booking] = await db.insert(bookings).values({
        hotelId: hotel.id,
        roomId: room.id,
        customerId: customer.id,
        ...(source === 'reception' ? { bookedByStaffId: receptionist.id } : {}),
        checkIn,
        checkOut,
        status,
        source,
        idempotencyKey: `seed-key-${bookingIndex + 1}`,
        totalPrice,
      }).returning();

      await db.insert(payments).values({
        bookingId: booking.id,
        amount: totalPrice,
        status: paymentStatus,
        processedAt: new Date(),
      });

      if (roomStatus !== 'available') {
        await db.update(rooms).set({ status: roomStatus }).where(eq(rooms.id, room.id));
      }

      bookingIndex++;
    }
  }

  // 7. Set a handful of rooms to maintenance / out_of_service (rooms not used by bookings)
  const idleRooms = insertedRooms.slice(bookingIndex);
  for (let i = 0; i < 10 && i < idleRooms.length; i++) {
    await db.update(rooms).set({ status: 'maintenance' }).where(eq(rooms.id, idleRooms[i].id));
  }
  for (let i = 10; i < 15 && i < idleRooms.length; i++) {
    await db.update(rooms).set({ status: 'out_of_service' }).where(eq(rooms.id, idleRooms[i].id));
  }

  console.log('\nSeed complete!');
  console.log(`  hotel_id:  ${hotel.id}`);
  console.log(`  rooms:     ${insertedRooms.length} (${FLOORS} floors x 10)`);
  console.log(`  bookings:  ${bookingIndex} (20 CONFIRMED, 15 CHECKED_IN, 40 CHECKED_OUT, 25 CANCELLED)`);
  console.log(`  staff:     receptionist id=${receptionist.id}, manager id=${manager.id}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
