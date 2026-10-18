import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  deleteProfileImage,
  MAX_PROFILE_IMAGE_BYTES,
  uploadProfileImage,
} from "../services/objectStorage.js";
import { requireVerifiedEmailForAction } from "../services/userVerification.js";

const prisma = new PrismaClient();
export const profileRouter = Router();

profileRouter.use(authenticateToken);

const PROFILE_FIELDS = [
  "displayName",
  "countryOfResidence",
  "instagram",
  "telegram",
  "facebook",
  "email",
  "phoneNumber",
] as const;

const VISIBILITY_FIELDS = [
  "instagramVisible",
  "telegramVisible",
  "facebookVisible",
  "emailVisible",
  "phoneNumberVisible",
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];
type VisibilityField = (typeof VISIBILITY_FIELDS)[number];

function cleanOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
}

function cleanHandle(value: unknown): string | null | undefined {
  const cleaned = cleanOptionalString(value);
  if (!cleaned) return cleaned;
  return cleaned.replace(/^@+/, "").slice(0, 200);
}

function buildProfileData(body: Record<string, unknown>, userId: string) {
  const data: Record<string, unknown> = { userId };
  for (const field of PROFILE_FIELDS) {
    if (field in body) {
      data[field] = field === "instagram" || field === "telegram" ? cleanHandle(body[field]) : cleanOptionalString(body[field]);
    }
  }
  for (const field of VISIBILITY_FIELDS) {
    data[field] = typeof body[field] === "boolean" ? body[field] : false;
  }
  return data;
}

function emptyProfile() {
  return {
    displayName: null,
    profileImageUrl: null,
    profileImageObjectKey: null,
    countryOfResidence: null,
    instagram: null,
    instagramVisible: false,
    telegram: null,
    telegramVisible: false,
    facebook: null,
    facebookVisible: false,
    email: null,
    emailVisible: false,
    phoneNumber: null,
    phoneNumberVisible: false,
  };
}

function serializeOwnerProfile(profile: any) {
  return {
    ...emptyProfile(),
    ...(profile || {}),
  };
}

function parseDataUrl(dataUrl: unknown, contentType: unknown): { buffer: Buffer; contentType: string } | { error: string } {
  if (typeof dataUrl !== "string" || typeof contentType !== "string") {
    return { error: "dataUrl and contentType are required" };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(contentType as any)) {
    return { error: "Unsupported image type" };
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { error: "Invalid image payload" };
  if (match[1] !== contentType) return { error: "Image content type mismatch" };
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) return { error: "Invalid image payload" };
  if (buffer.length > MAX_PROFILE_IMAGE_BYTES) return { error: "Image is too large" };
  return { buffer, contentType };
}

function exposesContactFields(body: Record<string, unknown>): boolean {
  return VISIBILITY_FIELDS.some((field) => body[field] === true);
}

profileRouter.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    res.json(serializeOwnerProfile(profile));
  } catch (error) {
    console.error("Profile get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.put("/me", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (exposesContactFields(req.body || {}) && !(await requireVerifiedEmailForAction(prisma, userId, res))) return;
    const data = buildProfileData(req.body || {}, userId);
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: data as any,
      update: data as any,
    });
    res.json(serializeOwnerProfile(profile));
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post("/me/photo", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = parseDataUrl(req.body?.dataUrl, req.body?.contentType);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const userId = req.user!.userId;
    const existing = await prisma.userProfile.findUnique({ where: { userId } });
    const uploaded = await uploadProfileImage({ userId, buffer: parsed.buffer, contentType: parsed.contentType });
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        profileImageUrl: uploaded.publicUrl,
        profileImageObjectKey: uploaded.objectKey,
      },
      update: {
        profileImageUrl: uploaded.publicUrl,
        profileImageObjectKey: uploaded.objectKey,
      },
    });
    await deleteProfileImage((existing as any)?.profileImageObjectKey);
    res.json(serializeOwnerProfile(profile));
  } catch (error) {
    console.error("Profile image upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.delete("/me/photo", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.userProfile.findUnique({ where: { userId } });
    if (!existing) {
      res.status(204).send();
      return;
    }
    await prisma.userProfile.update({
      where: { userId },
      data: { profileImageUrl: null, profileImageObjectKey: null },
    });
    await deleteProfileImage((existing as any).profileImageObjectKey);
    res.status(204).send();
  } catch (error) {
    console.error("Profile image delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
