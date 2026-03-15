import 'dotenv/config';
import express from 'express'
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import roomRoutes from './routes/rooms';
import bookingRoutes from './routes/booking';
import webhookRoutes from './routes/webhook';
import staffRoutes from './routes/staff';
import { requestId, notFound, errorHandler } from './middleware/errorHandler';
import { startPaymentProcessorCron } from './jobs/paymentProcessor';

const app = express()

const PORT = process.env.PORT ?? 3000

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(requestId);

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
app.use('/api/bookings', bookingRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/staff', staffRoutes);

app.get('/', (_req, res) => {
  res.send('Welcome to the Hotel Booking API. Yes, it works. No, you cannot check in here.');
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(notFound);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  const cronHandle = startPaymentProcessorCron();

  // Graceful shutdown — stop accepting new requests, clear the cron, then exit
  process.on('SIGTERM', () => {
    console.log('[shutdown] SIGTERM received, shutting down gracefully...');
    clearInterval(cronHandle);
    server.close(() => {
      console.log('[shutdown] HTTP server closed');
      process.exit(0);
    });
  });
});
