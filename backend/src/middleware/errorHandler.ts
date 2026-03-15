import { Request, Response, NextFunction } from 'express';


/**
 * Global error handler — catches anything thrown from route handlers.
 *
 * Differentiates between:
 *  - Client errors (4xx): log at warn level, safe to surface the message
 *  - Server errors (5xx): log full stack, return a generic message to avoid
 *    leaking internal details to the client
 */
export function errorHandler(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.status ?? err.statusCode ?? 500;
  const isClientError = status >= 400 && status < 500;

  if (isClientError) {
    console.warn(`[${(req as any).id}] ${req.method} ${req.path} → ${status}: ${err.message}`);
  } else {
    console.error(`[${(req as any).id}] ${req.method} ${req.path} → ${status}:`, err);
  }

  res.status(status).json({
    error: isClientError ? err.message : 'Internal server error',
    requestId: (req as any).id,
  });
}
