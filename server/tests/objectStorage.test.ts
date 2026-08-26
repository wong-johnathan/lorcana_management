import { afterEach, describe, expect, it, vi } from "vitest";
import { access, rm } from "fs/promises";
import path from "path";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn().mockResolvedValue({}) }));

vi.mock("@aws-sdk/client-s3", () => ({
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
  deleteProfileImage,
  LOCAL_UPLOAD_ROOT,
  uploadProfileImage,
} from "../src/services/objectStorage.js";

afterEach(async () => {
  delete process.env.OBJECT_STORAGE_DRIVER;
  delete process.env.S3_BUCKET;
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_PUBLIC_URL;
  sendMock.mockClear();
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
});
