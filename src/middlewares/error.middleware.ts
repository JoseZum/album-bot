import { NextFunction, Request, Response } from 'express';

const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
};

const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
  const error = err as { statusCode?: number; message?: string };
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
  });
};

export { errorHandler, notFoundHandler };