import { Router, Request, Response, NextFunction } from 'express';
import { getAvailableRooms, getRoomCategories } from '../services/rooms';

const router: Router = Router();


router.get('/available', async(req: Request, res: Response, next: NextFunction) => {
  const { check_in, check_out, categoryId } = req.query;

  if (!check_in || !check_out) {
    return res.status(422).json({ error: 'check_in, and check_out are required' });
  }

  const checkIn = new Date(check_in as string);
  const checkOut = new Date(check_out as string);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return res.status(422).json({ error: 'Invalid date format, use YYYY-MM-DD' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (checkIn < today) {
    return res.status(422).json({ error: 'check_in must be today or in the future' });
  }

  if (checkOut <= checkIn) {
    return res.status(422).json({ error: 'check_out must be after check_in' });
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  try {
    const result = await getAvailableRooms({
      checkIn,
      checkOut,
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
      page,
      limit,
    });
    return res.json(result);
  } catch(err) {
    next(err);
  }
});

router.get('/category', async(_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await getRoomCategories();
    return res.json(categories);
  } catch(err) {
    next(err);
  }
});

export default router;