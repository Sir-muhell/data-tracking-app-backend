import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend the Request object to include user data
export interface AuthenticatedRequest extends Request {
  userId?: string;
  role?: "user" | "admin";
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Expects "Bearer TOKEN"

  if (token == null) return res.sendStatus(401); // No token

  jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
    if (err) return res.sendStatus(403); // Invalid token
    // The 'user' object is what you encoded in the token (e.g., { id, role })
    const payload = user as { id: string; role: "user" | "admin" };
    req.userId = payload.id;
    req.role = payload.role;
    next();
  });
};

// Middleware to check for Admin role
export const isAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied: Admin privileges required." });
  }
  next();
};
