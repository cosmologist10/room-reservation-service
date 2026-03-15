# Room Reservation Service

A hotel room reservation system with availability search, OTP-verified booking, and payment processing.

---

## With Docker

### Prerequisites
- Docker Desktop installed and running

### Run
```sh
docker compose up --build
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173
- Postgres: localhost:5432

---

## Without Docker

### Prerequisites
- Node.js 22+
- pnpm
- PostgreSQL running locally

### 1. Environment setup

Create `backend/.env`:
```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/roomreservation
WEBHOOK_SECRET=dev-webhook-secret
PAYMENT_CRON_INTERVAL_MS=60000
```

### 2. Database setup

```sh
createdb roomreservation
cd backend
pnpm install
pnpm db:migrate
```

### 3. Seed data

Seeds 1 hotel, 3 room categories, and 500 rooms (50 floors × 10 rooms):

```sh
pnpm tsx seed.ts
```

### 4. Start backend

```sh
pnpm dev
```

Backend runs on http://localhost:3000. On startup the payment processor cron starts automatically, polling for unconfirmed bookings every 60 seconds.

### 5. Start frontend

```sh
cd ../frontend
pnpm install
pnpm dev
```

Frontend runs on http://localhost:5173.

---

## OTP (development mode)

There is no real email provider configured. OTPs are printed directly to the **backend server console**:

```
[otp] ✉  OTP for user@example.com: 482910 (expires in 10 min)
```

- OTPs are valid for **10 minutes**
- Re-requesting within the window will log the **existing OTP** again with the remaining time
- OTPs are consumed (one-time use) on booking creation
- OTPs are reusable within their window for viewing bookings

---

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms/available` | Search available rooms (`check_in`, `check_out`, `categoryId`, `page`, `limit`) |
| GET | `/api/rooms/category` | List room categories |
| POST | `/api/bookings/otp` | Request OTP for email |
| POST | `/api/bookings` | Create booking (requires `Idempotency-Key` and `X-OTP` headers) |
| GET | `/api/bookings` | Get bookings by email (requires `X-OTP` header) |
| POST | `/api/webhooks/payment` | Simulate payment confirmation (requires `x-webhook-secret` header) |
| GET | `/health` | Health check |

### Simulate a payment webhook

```sh
curl -X POST http://localhost:3000/api/webhooks/payment \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: dev-webhook-secret" \
  -d '{"event": "payment.authorized", "data": {"booking_id": 1, "payment_id": 1}}'
```

---

## Project structure

```
├── backend/
│   ├── src/
│   │   ├── db/          # Drizzle ORM setup and schema
│   │   ├── jobs/        # Payment processor cron
│   │   ├── middleware/  # Request ID, error handler, 404
│   │   ├── routes/      # rooms, booking, webhook
│   │   ├── services/    # Business logic (booking, otp, notification)
│   │   └── utils/       # State machine (booking/payment transitions)
│   ├── seed.ts          # Database seed script
│   └── drizzle.config.ts
└── frontend/
    └── src/
        └── App.tsx      # Room search, booking dialog, my bookings
```
