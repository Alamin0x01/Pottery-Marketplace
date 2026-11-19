import { parseOrThrow } from '../utils/validate.js';

/**
 * Validates `req.query` / `req.params` / `req.body` with zod schemas and exposes the parsed values as
 * `req.valid.query|params|body`. (Express 5 query objects are read-only, so parsed data lives separately.)
 * Handlers must read `req.valid`, never the raw request.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) req.valid[part] = parseOrThrow(schemas[part], req[part] ?? {});
    }
    next();
  } catch (err) {
    next(err);
  }
};
