import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { authenticateToken, signToken, type AuthRequest } from "../src/middleware/auth.js";

function mockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  return res;
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without bearer token", () => {
    const req = { headers: {} } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid or expired tokens", () => {
    const req = { headers: { authorization: "Bearer not-a-token" } } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches verified JWT payload and calls next", () => {
    const token = signToken({ userId: "user_1", username: "jw1005" });
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(req.user).toEqual({ userId: "user_1", username: "jw1005", iat: expect.any(Number), exp: expect.any(Number) });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("signToken creates a seven-day JWT containing the user identity", () => {
    const token = signToken({ userId: "u1", username: "alice" });
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    expect(decoded.userId).toBe("u1");
    expect(decoded.username).toBe("alice");
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60);
  });
});
