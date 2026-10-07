import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/api';

type Source = 'body' | 'query' | 'params';

/**
 * Validates a request with a zod schema before it reaches the controller.
 * Rejecting bad input here is what keeps malformed data out of the database.
 */
export function validate(schema: AnyZodObject, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      // Assign the parsed (typed, coerced) values back onto the request.
      (req as any)[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          AppError.validation(
            'Please check the form and try again',
            err.errors.map((e) => ({ field: e.path.join('.') || source, message: e.message })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}
