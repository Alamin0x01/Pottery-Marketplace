import { ApiError } from './ApiError.js';

/** Parses with a zod schema; throws a 400 ApiError (field paths + messages only, never input values). */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw ApiError.badRequest(
      'Validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
