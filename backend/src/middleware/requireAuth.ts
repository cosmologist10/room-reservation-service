import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface StaffPayload {
  id: number;
  email: string;
  role: string;
}

// Extend Express Request so downstream handlers get typed access to req.staff
declare global {
  namespace Express {
    interface Request {
      staff?: StaffPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or malformed' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.staff = jwt.verify(token, JWT_SECRET) as StaffPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
