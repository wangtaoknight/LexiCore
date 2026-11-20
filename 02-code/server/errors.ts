export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, options: { code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = options.code ?? 'app_error';
    this.details = options.details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, message, { code: 'bad_request', details });
}

export function notFound(message = '资源不存在'): AppError {
  return new AppError(404, message, { code: 'not_found' });
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, message, { code: 'conflict', details });
}

export function upstreamError(message: string, details?: unknown): AppError {
  return new AppError(502, message, { code: 'upstream_error', details });
}
