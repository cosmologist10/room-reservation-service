import { Router, Request, Response } from 'express';
import { getDashboard, getActiveBookings, getBookingHistory, cancelBooking, checkInBooking, checkOutBooking, loginStaff, NotFoundError, InvalidTransitionError, InvalidCredentialsError } from '../services/staff';
import { requireAuth } from '../middleware/requireAuth';

const router: Router = Router();

router.post('/login', async (req: Request, res: Response): Promise<Response> => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(422).json({ error: 'email and password are required' });
  }
  try {
    const result = await loginStaff(email, password);
    return res.json(result);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) return res.status(401).json({ error: err.message });
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.use(requireAuth);

router.get('/dashboard', async (_req: Request, res: Response): Promise<Response> => {
  try {
    const data = await getDashboard();
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

router.get('/bookings/active', async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  try {
    return res.json(await getActiveBookings(page, limit));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch active bookings' });
  }
});

router.get('/bookings/history', async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  try {
    return res.json(await getBookingHistory(page, limit));
  } catch {
    return res.status(500).json({ error: 'Failed to fetch booking history' });
  }
});

router.put('/:id/cancel', async (req: Request, res: Response): Promise<Response> => {
  try {
    const booking = await cancelBooking(Number(req.params.id));
    return res.json({ booking });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof InvalidTransitionError) return res.status(422).json({ error: err.message });
    return res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

router.put('/:id/checkin', async (req: Request, res: Response): Promise<Response> => {
  try {
    const booking = await checkInBooking(Number(req.params.id));
    return res.json({ booking });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof InvalidTransitionError) return res.status(422).json({ error: err.message });
    return res.status(500).json({ error: 'Failed to check in booking' });
  }
});

router.put('/:id/checkout', async (req: Request, res: Response): Promise<Response> => {
  try {
    const booking = await checkOutBooking(Number(req.params.id));
    return res.json({ booking });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof InvalidTransitionError) return res.status(422).json({ error: err.message });
    return res.status(500).json({ error: 'Failed to check out booking' });
  }
});

export default router;
