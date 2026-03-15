# Room Reservation Service

## With Docker

### Prerequisites
- Docker Desktop installed and running

### Run
```sh
docker compose up --build
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173
- Postgres: localhost:5433

---

## Without Docker

### Prerequisites
- Node.js 22+
- pnpm
- PostgreSQL running locally

### Backend
```sh
cd backend
pnpm install
pnpm dev
```

### Frontend
```sh
cd frontend
pnpm install
pnpm dev
```
