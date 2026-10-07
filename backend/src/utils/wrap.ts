import { Request, Response, NextFunction } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Forwards rejected promises from an async handler to the error middleware. */
export const catchAsync =
  (fn: Handler) => (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = fn(req, res, next);
      // Synchronous controllers (they call res.json themselves) return undefined.
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };

/**
 * Wraps every exported controller in `catchAsync` via a Proxy, so an async
 * controller can never take the process down with an unhandled rejection -
 * the error always reaches the central error middleware and becomes JSON.
 */
export function wrapAll<T extends Record<string, unknown>>(mod: T): T {
  return new Proxy(mod, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? catchAsync(value as Handler) : value;
    },
  });
}
