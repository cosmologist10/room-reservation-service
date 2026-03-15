import 'dotenv/config';
import { db } from './src/db';
import { hotels, roomCategories, rooms } from './src/db/schema';

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


  console.log('\nSeed complete!');
  console.log(`  hotel_id:  ${hotel.id}`);
  console.log(`  rooms:     ${insertedRooms.length} (${FLOORS} floors x 10)`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});