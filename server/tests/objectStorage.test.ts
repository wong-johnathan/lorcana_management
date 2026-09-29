import { afterEach, describe, expect, it, vi } from "vitest";
import { access, rm } from "fs/promises";
import path from "path";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn().mockResolvedValue({}) }));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  HeadObjectCommand: class HeadObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutObjectCommand: class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  S3Client: vi.fn().mockImplementation(function S3Client() {
    return { send: sendMock };
  }),
}));

import {
  cardImageExists,
  cardImagePublicUrl,
  deleteProfileImage,
  LOCAL_UPLOAD_ROOT,
  makeCardImageObjectKey,
  uploadCardImage,
  uploadProfileImage,
} from "../src/services/objectStorage.js";

afterEach(async () => {
  delete process.env.OBJECT_STORAGE_DRIVER;
  delete process.env.S3_BUCKET;
  delete process.env.MINIO_BUCKET;
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_PUBLIC_URL;
  delete process.env.CARD_IMAGE_BUCKET;
  delete process.env.S3_CARD_IMAGE_BUCKET;
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  vi.restoreAllMocks();
  await rm(path.join(LOCAL_UPLOAD_ROOT, "profile-images"), { recursive: true, force: true });
});

describe("object storage service", () => {
  it("stores local profile images under a stable public route and deletes them", async () => {
    const uploaded = await uploadProfileImage({
      userId: "user_1",
      buffer: Buffer.from("image"),
      contentType: "image/png",
    });

    expect(uploaded.objectKey).toMatch(/^profile-images\/user_1\/.+\.png$/);
    expect(uploaded.publicUrl).toBe(`/api/profile-images/${uploaded.objectKey}`);
    await expect(access(path.join(LOCAL_UPLOAD_ROOT, uploaded.objectKey))).resolves.toBeUndefined();

    await expect(deleteProfileImage(uploaded.objectKey)).resolves.toBeUndefined();
    await expect(access(path.join(LOCAL_UPLOAD_ROOT, uploaded.objectKey))).rejects.toThrow();
    await expect(deleteProfileImage(null)).resolves.toBeUndefined();
    await expect(deleteProfileImage("../outside.png")).resolves.toBeUndefined();
  });

  it("falls back to bin extension for unexpected content types at the storage boundary", async () => {
    const uploaded = await uploadProfileImage({
      userId: "user_1",
      buffer: Buffer.from("image"),
      contentType: "application/octet-stream",
    });

    expect(uploaded.objectKey).toMatch(/\.bin$/);
  });

  it("can target MinIO/S3-compatible storage through the same upload abstraction", async () => {
    process.env.OBJECT_STORAGE_DRIVER = "s3";
    process.env.S3_BUCKET = "lorcana-profile-images";
    process.env.S3_ENDPOINT = "http://minio:9000";
    process.env.S3_PUBLIC_URL = "https://cdn.example.com";

    const uploaded = await uploadProfileImage({
      userId: "user_1",
      buffer: Buffer.from("image"),
      contentType: "image/webp",
    });

    expect(uploaded.objectKey).toMatch(/\.webp$/);
    expect(uploaded.publicUrl).toBe(`https://cdn.example.com/lorcana-profile-images/${uploaded.objectKey}`);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "lorcana-profile-images",
      Key: uploaded.objectKey,
      ContentType: "image/webp",
    });
    await expect(deleteProfileImage(uploaded.objectKey)).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1][0].input).toMatchObject({
      Bucket: "lorcana-profile-images",
      Key: uploaded.objectKey,
    });
  });

  it("best-effort deletes MinIO/S3 profile images without blocking profile updates", async () => {
    process.env.OBJECT_STORAGE_DRIVER = "s3";
    process.env.MINIO_BUCKET = "minio-profile-images";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    sendMock.mockRejectedValueOnce(new Error("minio unavailable"));

    await expect(deleteProfileImage("profile-images/user_1/old.png")).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "minio-profile-images",
      Key: "profile-images/user_1/old.png",
    });
    expect(warn).toHaveBeenCalledWith("Profile image S3 cleanup failed:", expect.any(Error));
  });

  it("uses jpeg extensions and derives AWS public URLs when no custom public endpoint exists", async () => {
    process.env.OBJECT_STORAGE_DRIVER = "s3";
    process.env.S3_BUCKET = "bucket";
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_PUBLIC_URL;

    const uploaded = await uploadProfileImage({
      userId: "user_1",
      buffer: Buffer.from("image"),
      contentType: "image/jpeg",
    });

    expect(uploaded.objectKey).toMatch(/\.jpg$/);
    expect(uploaded.publicUrl).toContain("https://bucket.s3.us-east-1.amazonaws.com/profile-images/user_1/");
  });

  it("stores card images in the dedicated MinIO bucket with deterministic keys and public URLs", async () => {
    process.env.OBJECT_STORAGE_DRIVER = "s3";
    process.env.CARD_IMAGE_BUCKET = "lorcana-card-images";
    process.env.S3_PUBLIC_URL = "https://minio.example.com";

    const uploaded = await uploadCardImage({
      cardId: "card_1",
      sourceUrl: "https://cdn.example.com/cards/elsa.jpeg?width=600",
      buffer: Buffer.from("image"),
      contentType: "image/jpeg",
    });

    expect(uploaded.objectKey).toBe(makeCardImageObjectKey("card_1", "https://cdn.example.com/cards/elsa.jpeg?width=600", "image/jpeg"));
    expect(uploaded.objectKey).toMatch(/^card-images\/card_1\/.+\.jpg$/);
    expect(uploaded.publicUrl).toBe(`https://minio.example.com/lorcana-card-images/${uploaded.objectKey}`);
    expect(uploaded.contentType).toBe("image/jpeg");
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "lorcana-card-images",
      Key: uploaded.objectKey,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("checks card image existence through MinIO HEAD and falls back to local storage in local mode", async () => {
    process.env.OBJECT_STORAGE_DRIVER = "s3";
    process.env.CARD_IMAGE_BUCKET = "lorcana-card-images";
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_PUBLIC_URL;
    expect(cardImagePublicUrl("card-images/card_1/image.jpg")).toBe("https://lorcana-card-images.s3.us-east-1.amazonaws.com/card-images/card_1/image.jpg");
    sendMock.mockResolvedValueOnce({});
    await expect(cardImageExists("card-images/card_1/image.jpg")).resolves.toBe(true);
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "lorcana-card-images",
      Key: "card-images/card_1/image.jpg",
    });

    sendMock.mockRejectedValueOnce(new Error("missing"));
    await expect(cardImageExists("card-images/card_1/missing.jpg")).resolves.toBe(false);

    delete process.env.OBJECT_STORAGE_DRIVER;
    const local = await uploadCardImage({
      cardId: "card_2",
      sourceUrl: "https://cdn.example.com/cards/mickey.webp",
      buffer: Buffer.from("image"),
      contentType: "image/webp",
    });
    await expect(cardImageExists(local.objectKey)).resolves.toBe(true);
    await expect(cardImageExists("card-images/card_2/not-written.webp")).resolves.toBe(false);
    await expect(cardImageExists("../outside.jpg")).resolves.toBe(false);
    expect(cardImagePublicUrl(local.objectKey)).toBe(`/api/profile-images/${local.objectKey}`);
  });
});
