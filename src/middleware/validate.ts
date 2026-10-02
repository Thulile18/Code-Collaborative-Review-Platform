import { Request, Response, NextFunction } from "express";

// Checks that the listed fields exist and aren't empty in req.body
export function requireFields(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter((field) => !req.body[field]);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required field(s): ${missing.join(", ")}`,
      });
    }
    next();
  };
}