import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/* v8 ignore next -- CI always sets JWT_SECRET; fallback is local/dev convenience only. */
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface AuthPayload {
  userId: string;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

function tokenFromRequest(req: AuthRequest): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

export function verifyAuthToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token = tokenFromRequest(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    if (!payload) throw new Error("invalid token");
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authenticateOptional(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const token = tokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    if (payload) req.user = payload;
  } catch {
    // Marketplace browsing stays public; an invalid optional token simply means anonymous browsing.
  }
  next();
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
