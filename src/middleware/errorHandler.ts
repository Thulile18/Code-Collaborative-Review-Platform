import { Request, Response, NextFunction } from "express";

// Wraps an async route so any thrown error gets passed to Express's error handler
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Catches anything that reaches here and sends a clean response
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Something went wrong",
  });
}