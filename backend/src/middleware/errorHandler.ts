import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorBody, toAppError } from '../utils/api';
import { logger } from '../utils/logger';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound('Endpoint'));
}

/** Central error middleware - the single place where errors become JSON. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;

  if (err instanceof ZodError) {
    appError = AppError.validation(
      'Please check the form and try again',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    );
  } else {
    appError = toAppError(err);
  }

  if (appError.status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${appError.status}`, {
      message: appError.message,
      raw: (err as Error)?.message,
      stack: (err as Error)?.stack?.split('\n').slice(0, 4).join(' | '),
    });
  } else {
    // Include the underlying driver message at debug level: 4xx from the database
    // (bad column, wrong arity) are bugs, not user errors, and must be visible.
    logger.debug(
      `${req.method} ${req.originalUrl} -> ${appError.status} ${appError.message}`
      + `${(err as Error)?.message ? ` | raw: ${(err as Error).message}` : ''}`,
    );
  }

  const body: ErrorBody = {
    success: false,
    message: appError.status >= 500 ? 'Something went wrong on our side. Please try again.' : appError.message,
    code: appError.code,
    ...(appError.details ? { errors: appError.details } : {}),
  };
  res.status(appError.status).json(body);
}
