import { createHash, randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const LOCAL_UPLOAD_ROOT = process.env.LOCAL_UPLOAD_ROOT || path.resolve(process.cwd(), "uploads");

const DEFAULT_PROFILE_IMAGE_PUBLIC_URL = "https://minio.johnathanwwh.com";
const LEGACY_PROFILE_IMAGE_PUBLIC_URLS = ["https://lorcana-minio.johnathanwwh.com"];

type UploadProfileImageInput = {
  userId: string;
  buffer: Buffer;
  contentType: string;
};

type UploadProfileImageResult = {
  objectKey: string;
  publicUrl: string;
};

function extensionForContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}

function makeObjectKey(userId: string, contentType: string, buffer: Buffer): string {
  const ext = extensionForContentType(contentType);
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  return `profile-images/${userId}/${Date.now()}-${digest}-${randomUUID()}.${ext}`;
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

export function normalizeProfileImageUrl(url: string | null | undefined): string | null | undefined {
  if (typeof url !== "string") return url;
  const canonicalBase = (process.env.S3_PUBLIC_URL || DEFAULT_PROFILE_IMAGE_PUBLIC_URL).replace(/\/$/, "");
  for (const legacyBase of LEGACY_PROFILE_IMAGE_PUBLIC_URLS) {
    const normalizedLegacyBase = legacyBase.replace(/\/$/, "");
    if (url === normalizedLegacyBase) return canonicalBase;
    if (url.startsWith(`${normalizedLegacyBase}/`)) {
      return `${canonicalBase}${url.slice(normalizedLegacyBase.length)}`;
    }
  }
  return url;
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
