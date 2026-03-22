/**
 * Typed application error class and factory helpers.
 *
 * Use the factory functions (badRequest, notFound, …) rather than
 * constructing AppError directly so that status codes and canonical
 * error codes stay in one place.
 *
 * All AppError instances carry a numeric HTTP status code and a
 * machine-readable string code. The global error handler in server.ts
 * can detect AppError and forward those fields straight to the response.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 400 Bad Request */
export function badRequest(code: string, message: string): AppError {
  return new AppError(400, code, message);
}

/** 404 Not Found */
export function notFound(code: string, message: string): AppError {
  return new AppError(404, code, message);
}

/** 401 Unauthorized */
export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

/** 403 Forbidden */
export function forbidden(message = 'Insufficient permissions'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

/** 409 Conflict */
export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}
