import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import logger from "../utils/logger";
import { AuthenticatedRequest } from "./authMiddleware";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

export const requestLogger = (
  req: Request | AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  req.startTime = Date.now();

  const logData: any = {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
  };

  if ((req as AuthenticatedRequest).userId) {
    logData.userId = (req as AuthenticatedRequest).userId;
  }

  logger.info("Incoming request", logData);

  res.on("finish", () => {
    const duration = Date.now() - (req.startTime || 0);
    const logData: any = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    if ((req as AuthenticatedRequest).userId) {
      logData.userId = (req as AuthenticatedRequest).userId;
    }

    if (res.statusCode >= 400) {
      logger.warn("Request completed with error", logData);
    } else {
      logger.info("Request completed", logData);
    }
  });

  next();
};
