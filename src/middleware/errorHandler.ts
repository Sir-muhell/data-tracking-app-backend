import type { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./authMiddleware";
import logger from "../utils/logger";

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: ApiError,
  req: Request | AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  const logData: any = {
    requestId: (req as any).requestId,
    statusCode,
    message,
    path: req.path,
    method: req.method,
  };

  if (process.env.NODE_ENV === "development") {
    logData.stack = err.stack;
  }

  if (statusCode >= 500) {
    logger.error("Unhandled error", logData);
  } else {
    logger.warn("Client error", logData);
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export const asyncHandler = (
  fn: (req: Request | AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request | AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const createError = (message: string, statusCode: number = 500): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};
