import express from 'express';
import roomRoutes from '../../routes/rooms';
import bookingRoutes from '../../routes/booking';
import webhookRoutes from '../../routes/webhook';
import { requestId, notFound, errorHandler } from '../../middleware/errorHandler';

/**
 * Creates the Express app without starting the server or the cron job.
 * Used by all route tests via supertest.
 */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
