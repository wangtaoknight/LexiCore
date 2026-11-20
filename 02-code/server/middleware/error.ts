import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: '接口不存在' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error('[server] 未处理异常:', error);
  res.status(500).json({ error: { code: 'internal_error', message } });
}

/** 包装 async 路由，统一把异常交给 errorHandler */
export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response) => Promise<void> | void,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req as T, res)).catch(next);
  };
}
