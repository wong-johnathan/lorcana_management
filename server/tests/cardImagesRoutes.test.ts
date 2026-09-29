import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const storageMocks = vi.hoisted(() => ({
  cardImageExists: vi.fn(),
  cardImagePublicUrl: vi.fn(),
  uploadCardImage: vi.fn(),
}));

vi.mock("../src/services/objectStorage.js", () => ({
  LOCAL_UPLOAD_ROOT: "/tmp/lorcana-profile-test-uploads",
  ALLOWED_IMAGE_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"],
  MAX_PROFILE_IMAGE_BYTES: 5 * 1024 * 1024,
  cardImageExists: storageMocks.cardImageExists,
  cardImagePublicUrl: storageMocks.cardImagePublicUrl,
  uploadCardImage: storageMocks.uploadCardImage,
  makeCardImageObjectKey: vi.fn((cardId: string) => `card-images/${cardId}/source-hash.jpg`),
}));

import { createApp } from "../src/app.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";
import { cardImageExists, cardImagePublicUrl, uploadCardImage } from "../src/services/objectStorage.js";

const app = createApp();

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "card_1",
    imageUrl: "https://images.lorcana.example/cards/elsa.jpg",
    imageObjectKey: null,
    imageContentType: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  storageMocks.cardImageExists.mockReset();
  storageMocks.cardImagePublicUrl.mockReset();
  storageMocks.uploadCardImage.mockReset();
  vi.unstubAllGlobals();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("card image cache routes", () => {
  it("redirects to the stored MinIO image when the cached object exists", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card({ imageObjectKey: "card-images/card_1/source-hash.jpg" }));
    storageMocks.cardImageExists.mockResolvedValueOnce(true);
    storageMocks.cardImagePublicUrl.mockReturnValueOnce("https://minio.example/lorcana-card-images/card-images/card_1/source-hash.jpg");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await request(app).get("/api/card-images/card_1").expect(302).expect("Location", "https://minio.example/lorcana-card-images/card-images/card_1/source-hash.jpg");

    expect(cardImageExists).toHaveBeenCalledWith("card-images/card_1/source-hash.jpg");
    expect(cardImagePublicUrl).toHaveBeenCalledWith("card-images/card_1/source-hash.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.card.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the card or source image URL is missing", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(null);
    await request(app).get("/api/card-images/missing_card").expect(404, { error: "Card not found" });

    prismaMock.card.findUnique.mockResolvedValueOnce(card({ imageUrl: "" }));
    await request(app).get("/api/card-images/card_1").expect(404, { error: "Card image not available" });
  });

  it("fetches the source image, stores it in MinIO, saves metadata, and redirects to MinIO on cache miss", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    storageMocks.uploadCardImage.mockResolvedValueOnce({
      objectKey: "card-images/card_1/source-hash.jpg",
      publicUrl: "https://minio.example/lorcana-card-images/card-images/card_1/source-hash.jpg",
      contentType: "image/jpeg",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("image/jpeg") },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    await request(app).get("/api/card-images/card_1").expect(302).expect("Location", "https://minio.example/lorcana-card-images/card-images/card_1/source-hash.jpg");

    expect(fetchMock).toHaveBeenCalledWith("https://images.lorcana.example/cards/elsa.jpg", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(uploadCardImage).toHaveBeenCalledWith(expect.objectContaining({
      cardId: "card_1",
      sourceUrl: "https://images.lorcana.example/cards/elsa.jpg",
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/jpeg",
    }));
    expect(prismaMock.card.update).toHaveBeenCalledWith({
      where: { id: "card_1" },
      data: {
        imageObjectKey: "card-images/card_1/source-hash.jpg",
        imageCachedAt: expect.any(Date),
        imageContentType: "image/jpeg",
      },
    });
  });

  it("defaults missing source content type to jpeg before caching", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    storageMocks.uploadCardImage.mockResolvedValueOnce({
      objectKey: "card-images/card_1/source-hash.jpg",
      publicUrl: "https://minio.example/lorcana-card-images/card-images/card_1/source-hash.jpg",
      contentType: "image/jpeg",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer,
    }));

    await request(app).get("/api/card-images/card_1").expect(302);

    expect(uploadCardImage).toHaveBeenCalledWith(expect.objectContaining({ contentType: "image/jpeg" }));
  });

  it("falls back to the original image URL when the source response is not a cacheable image", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: { get: vi.fn().mockReturnValue("image/jpeg") },
      arrayBuffer: async () => Uint8Array.from([]).buffer,
    }));
    await request(app).get("/api/card-images/card_1").expect(302).expect("Location", "https://images.lorcana.example/cards/elsa.jpg");

    prismaMock.card.findUnique.mockResolvedValueOnce(card());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("text/html") },
      arrayBuffer: async () => Uint8Array.from([]).buffer,
    }));
    await request(app).get("/api/card-images/card_1").expect(302).expect("Location", "https://images.lorcana.example/cards/elsa.jpg");

    expect(prismaMock.card.update).not.toHaveBeenCalled();
  });

  it("falls back to the original image URL when source fetch or MinIO upload fails", async () => {
    prismaMock.card.findUnique.mockResolvedValueOnce(card({ imageObjectKey: "card-images/card_1/missing.jpg" }));
    storageMocks.cardImageExists.mockResolvedValueOnce(false);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("source unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await request(app).get("/api/card-images/card_1").expect(302).expect("Location", "https://images.lorcana.example/cards/elsa.jpg");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(prismaMock.card.update).not.toHaveBeenCalled();
  });
});
