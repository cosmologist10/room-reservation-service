import 'dotenv/config';
import express from 'express'
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import roomRoutes from './routes/rooms';
import { errorHandler } from './middleware/errorHandler';

const app = express()

const PORT = process.env.PORT ?? 3000

app.use(cors({ origin: 'http://localhost:5173' }));

// General rate limit: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use(express.json());

app.use('/api/rooms', roomRoutes);

app.get('/', (_req, res) => {
  res.send('Welcome to the Hotel Booking API. Yes, it works. No, you cannot check in here.');
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[shutdown] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[shutdown] HTTP server closed');
    process.exit(0);
  });
});
