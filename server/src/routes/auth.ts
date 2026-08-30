import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { signToken } from "../middleware/auth.js";
import { verifyGoogleCredential } from "../services/googleAuth.js";

const prisma = new PrismaClient();
export const authRouter = Router();

function isRegistrationEnabled(): boolean {
  return process.env.REGISTER !== "false";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function serializeAuthUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    authProvider: user.authProvider ?? "LOCAL",
  };
}

function usernameBaseFromGoogle(email: string, _name: string | null): string {
  const raw = (email.split("@")[0] || "user").toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]+/g, "").slice(0, 24);
  return cleaned || "user";
}

async function uniqueUsername(base: string): Promise<string> {
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}${suffix}`;
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing) return candidate;
  }
  return `${base}${Date.now()}`;
}

authRouter.get("/config", (_req: Request, res: Response) => {
  res.json({
    registrationEnabled: isRegistrationEnabled(),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
});

authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    if (!isRegistrationEnabled()) {
      res.status(403).json({ error: "Registration is disabled" });
      return;
    }

    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    if (password.length < 6) {
      res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
      return;
    }

    const usernameLower = username.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { username: usernameLower } });
    if (existing) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username: usernameLower, passwordHash },
    });

    const token = signToken({ userId: user.id, username: user.username });
    res.status(201).json({ token, user: serializeAuthUser(user) });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: serializeAuthUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body || {};
    if (typeof credential !== "string" || credential.trim().length === 0) {
      res.status(400).json({ error: "Google credential is required" });
      return;
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      res.status(503).json({ error: "Google login is not configured" });
      return;
    }

    const identity = await verifyGoogleCredential(credential, googleClientId);
    if (!identity.emailVerified) {
      res.status(403).json({ error: "Google email is not verified" });
      return;
    }

    const emailNormalized = normalizeEmail(identity.email);
    const verifiedAt = new Date();
    let status = 200;
    let user = await prisma.user.findUnique({ where: { googleSub: identity.sub } });

    if (!user) {
      const emailUser = await prisma.user.findUnique({ where: { emailNormalized } });
      if (emailUser) {
        user = await prisma.user.update({
          where: { id: emailUser.id },
          data: {
            googleSub: identity.sub,
            email: identity.email,
            emailNormalized,
            emailVerifiedAt: emailUser.emailVerifiedAt ?? verifiedAt,
            authProvider: "GOOGLE",
          },
        });
      } else {
        const username = await uniqueUsername(usernameBaseFromGoogle(identity.email, identity.name));
        user = await prisma.user.create({
          data: {
            username,
            passwordHash: null,
            email: identity.email,
            emailNormalized,
            emailVerifiedAt: verifiedAt,
            googleSub: identity.sub,
            authProvider: "GOOGLE",
          },
        });
        status = 201;
      }
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.status(status).json({ token, user: serializeAuthUser(user) });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(401).json({ error: "Invalid Google credential" });
  }
});
