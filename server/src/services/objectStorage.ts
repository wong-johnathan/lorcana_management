import { createHash, randomUUID } from "crypto";
import { access, mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const LOCAL_UPLOAD_ROOT = process.env.LOCAL_UPLOAD_ROOT || path.resolve(process.cwd(), "uploads");

const DEFAULT_CARD_IMAGE_CONTENT_TYPE = "image/jpeg";

type UploadProfileImageInput = {
  userId: string;
  buffer: Buffer;
  contentType: string;
};

type UploadProfileImageResult = {
  objectKey: string;
  publicUrl: string;
};

export type UploadCardImageInput = {
  cardId: string;
  sourceUrl: string;
  buffer: Buffer;
  contentType?: string | null;
};

export type UploadCardImageResult = {
  objectKey: string;
  publicUrl: string;
  contentType: string;
};

function extensionForContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}

function safeImageContentType(contentType: string | null | undefined): string {
  return contentType?.startsWith("image/") ? contentType : DEFAULT_CARD_IMAGE_CONTENT_TYPE;
}

function extensionFromUrl(sourceUrl: string): string | null {
  try {
    const ext = path.extname(new URL(sourceUrl).pathname).replace(/^\./, "").toLowerCase();
    if (["jpg", "jpeg", "png", "webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch {
    return null;
  }
  return null;
}

function makeObjectKey(userId: string, contentType: string, buffer: Buffer): string {
  const ext = extensionForContentType(contentType);
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  return `profile-images/${userId}/${Date.now()}-${digest}-${randomUUID()}.${ext}`;
}

export function makeCardImageObjectKey(cardId: string, sourceUrl: string, contentType?: string | null): string {
  const digest = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
  const ext = extensionFromUrl(sourceUrl) || extensionForContentType(safeImageContentType(contentType));
  return `card-images/${cardId}/${digest}.${ext}`;
}

function localPublicUrl(objectKey: string): string {
  return `/api/profile-images/${objectKey}`;
}

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
}

function s3PublicUrl(bucket: string, objectKey: string): string {
  const base = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT;
  if (base) return `${base.replace(/\/$/, "")}/${bucket}/${objectKey}`;
  const region = process.env.S3_REGION || "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;
}

function s3Bucket(): string {
  return process.env.S3_BUCKET || process.env.MINIO_BUCKET || "lorcana-profile-images";
}

function cardImageBucket(): string {
  return process.env.CARD_IMAGE_BUCKET || process.env.S3_CARD_IMAGE_BUCKET || "lorcana-card-images";
}

export function cardImagePublicUrl(objectKey: string): string {
  if (process.env.OBJECT_STORAGE_DRIVER === "s3") return s3PublicUrl(cardImageBucket(), objectKey);
  return localPublicUrl(objectKey);
}

export async function cardImageExists(objectKey: string): Promise<boolean> {
  if (process.env.OBJECT_STORAGE_DRIVER === "s3") {
    try {
      await s3Client().send(new HeadObjectCommand({ Bucket: cardImageBucket(), Key: objectKey }));
      return true;
    } catch {
      return false;
    }
  }

  const uploadRoot = path.resolve(LOCAL_UPLOAD_ROOT);
  const target = path.resolve(uploadRoot, objectKey);
  if (!target.startsWith(`${uploadRoot}${path.sep}`)) return false;
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function uploadProfileImage(input: UploadProfileImageInput): Promise<UploadProfileImageResult> {
  const { userId, buffer, contentType } = input;
  const objectKey = makeObjectKey(userId, contentType, buffer);

  if (process.env.OBJECT_STORAGE_DRIVER === "s3") {
    const bucket = s3Bucket();
    await s3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return { objectKey, publicUrl: s3PublicUrl(bucket, objectKey) };
  }

  const target = path.join(LOCAL_UPLOAD_ROOT, objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return { objectKey, publicUrl: localPublicUrl(objectKey) };
}

export async function uploadCardImage(input: UploadCardImageInput): Promise<UploadCardImageResult> {
  const contentType = safeImageContentType(input.contentType);
  const objectKey = makeCardImageObjectKey(input.cardId, input.sourceUrl, contentType);

  if (process.env.OBJECT_STORAGE_DRIVER === "s3") {
    await s3Client().send(new PutObjectCommand({
      Bucket: cardImageBucket(),
      Key: objectKey,
      Body: input.buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return { objectKey, publicUrl: cardImagePublicUrl(objectKey), contentType };
  }

  const target = path.join(LOCAL_UPLOAD_ROOT, objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, input.buffer);
  return { objectKey, publicUrl: localPublicUrl(objectKey), contentType };
}

export async function deleteProfileImage(objectKey: string | null | undefined): Promise<void> {
  if (!objectKey) return;
  if (process.env.OBJECT_STORAGE_DRIVER === "s3") {
    try {
      await s3Client().send(new DeleteObjectCommand({
        Bucket: s3Bucket(),
        Key: objectKey,
      }));
    } catch (error) {
      console.warn("Profile image S3 cleanup failed:", error);
    }
    return;
  }
  const uploadRoot = path.resolve(LOCAL_UPLOAD_ROOT);
  const target = path.resolve(uploadRoot, objectKey);
  if (!target.startsWith(`${uploadRoot}${path.sep}`)) return;
  await rm(target, { force: true });
}
