import crypto from "crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createHashedToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyTokenHash(candidateToken: string, tokenHash: string): boolean {
  const candidateHash = createHashedToken(candidateToken);
  const candidate = Buffer.from(candidateHash, "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function isTokenExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt <= now;
}

export function createVerificationToken(ttlMs = 1000 * 60 * 60 * 24, now = new Date()) {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHashedToken(token),
    expiresAt: new Date(now.getTime() + ttlMs),
  };
}
