import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../request-context';
import { resolveRequestId } from '../request-id';

/**
 * Sets `req.id` and the `x-request-id` response header for every request
 * (including unknown routes, because it is applied globally before routing),
 * then binds the id to the AsyncLocalStorage context so downstream code and
 * the exception filter can read it via `getRequestId()`.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  (req as Request & { id: string }).id = requestId;
  res.setHeader('x-request-id', requestId);
  requestContext.run({ requestId }, () => {
    next();
  });
}
