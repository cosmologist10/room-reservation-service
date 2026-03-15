import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';


export const roomStatusEnum = pgEnum('room_status', [
  'available',
  'occupied',
  'maintenance',
  'out_of_service',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
]);

export const bookingSourceEnum = pgEnum('booking_source', [
  'website',
  'third_party',
  'reception',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending_authorization',
  'authorized',
  'captured',
  'failed',
  'refunded',
]);

export const staffRoleEnum = pgEnum('staff_role', [
  'admin',
  'receptionist',
  'manager',
]);

// ---------- Tables ----------

export const hotels = pgTable('hotels', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
},
(t) => [
  index('hotels_name_idx').on(t.name),
]
);


export const roomCategories = pgTable('room_categories', {
  id: serial('id').primaryKey(),
  hotelId: integer('hotel_id').notNull().references(() => hotels.id),
  name: text('name').notNull(),
  description: text('description'),
  basePrice: numeric('base_price', { precision: 10, scale: 2 }).notNull(), // NOK
  capacity: integer('capacity').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
},
(t) => [
    index('room_categories_hotel_id_idx').on(t.hotelId),
    index('room_categories_hotel_id__name_idx').on(t.hotelId, t.name),
  ]);

export const rooms = pgTable(
  'rooms',
  {
    id: serial('id').primaryKey(),
    hotelId: integer('hotel_id').notNull().references(() => hotels.id),
    categoryId: integer('category_id').notNull().references(() => roomCategories.id),
    roomNumber: text('room_number').notNull(),
    floor: integer('floor').notNull(),
    status: roomStatusEnum('status').notNull().default('available'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('rooms_hotel_id_idx').on(t.hotelId),
    uniqueIndex('rooms_hotel_room_number_idx').on(t.hotelId, t.roomNumber),
    index('rooms_category_id_idx').on(t.categoryId, ),
  ],
);


export const staff = pgTable(
  'staff',
  {
    id: serial('id').primaryKey(),
    hotelId: integer('hotel_id').notNull().references(() => hotels.id),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: staffRoleEnum('role').notNull(),
    hashedPassword: text('hashed_password').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('staff_email_idx').on(t.email),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('customers_email_idx').on(t.email),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    hotelId: integer('hotel_id').notNull().references(() => hotels.id),
    roomId: integer('room_id').notNull().references(() => rooms.id),
    customerId: integer('customer_id').notNull().references(() => customers.id),
    bookedByStaffId: integer('booked_by_staff_id').references(() => staff.id),
    checkIn: timestamp('check_in').notNull(),
    checkOut: timestamp('check_out').notNull(),
    status: bookingStatusEnum('status').notNull().default('PENDING_PAYMENT'),
    source: bookingSourceEnum('source').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    totalPrice: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('bookings_room_dates_idx').on(t.roomId, t.checkIn, t.checkOut),
    index('bookings_room_dates_confirmed_idx').on(t.roomId, t.checkIn, t.checkOut)
    .where(sql`${t.status} = 'CONFIRMED'`),
    uniqueIndex('bookings_idempotency_key_idx').on(t.idempotencyKey),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    bookingId: integer('booking_id').notNull().references(() => bookings.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: paymentStatusEnum('status').notNull().default('pending_authorization'),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payments_booking_id_idx').on(t.bookingId),
  ],
);

export const otpRequests = pgTable('otp_requests', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  otpCode: text('otp_code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
},
(t) => [
  index('otp_requests_email_idx').on(t.email),
]);
