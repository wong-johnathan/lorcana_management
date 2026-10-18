import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/services/objectStorage.js", () => ({
  uploadProfileImage: vi.fn().mockResolvedValue({
    objectKey: "profile-images/user_1/avatar.png",
    publicUrl: "/api/profile-images/profile-images/user_1/avatar.png",
  }),
  deleteProfileImage: vi.fn().mockResolvedValue(undefined),
  cardImageExists: vi.fn().mockResolvedValue(false),
  cardImagePublicUrl: vi.fn((key: string) => `/api/profile-images/${key}`),
  makeCardImageObjectKey: vi.fn((cardId: string) => `card-images/${cardId}/mock.jpg`),
  uploadCardImage: vi.fn().mockResolvedValue({ objectKey: "card-images/card_1/mock.jpg", publicUrl: "/api/profile-images/card-images/card_1/mock.jpg", contentType: "image/jpeg" }),
  ALLOWED_IMAGE_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"],
  MAX_PROFILE_IMAGE_BYTES: 5 * 1024 * 1024,
  LOCAL_UPLOAD_ROOT: "/tmp/lorcana-profile-test-uploads",
}));

import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";
import { deleteProfileImage, uploadProfileImage } from "../src/services/objectStorage.js";
import { buildPublicProfile } from "../src/routes/public.js";

const app = createApp();
const token = signToken({ userId: "user_1", username: "jw1005" });

function auth(req: request.Test) {
  return req.set("Authorization", `Bearer ${token}`);
}

const privateProfile = {
  id: "profile_1",
  userId: "user_1",
  displayName: "Johnathan",
  profileImageUrl: "/api/profile-images/profile-images/user_1/avatar.png",
  profileImageObjectKey: "profile-images/user_1/avatar.png",
  countryOfResidence: "Singapore",
  instagram: "john.cards",
  instagramVisible: true,
  telegram: "johntelegram",
  telegramVisible: true,
  facebook: "https://facebook.com/john",
  facebookVisible: false,
  email: "john@example.com",
  emailVisible: false,
  phoneNumber: "+6599999999",
  phoneNumberVisible: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
};

beforeEach(() => {
  resetPrismaMock();
  prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z") });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("profile routes", () => {
  it("requires auth and returns the owner profile with private fields", async () => {
    await request(app).get("/api/profile/me").expect(401, { error: "Authentication required" });

    prismaMock.userProfile.findUnique.mockResolvedValueOnce(privateProfile);

    const res = await auth(request(app).get("/api/profile/me")).expect(200);

    expect(res.body.email).toBe("john@example.com");
    expect(res.body.emailVisible).toBe(false);
    expect(prismaMock.userProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "user_1" } });
  });

  it("creates an empty owner profile response when profile rows do not exist yet", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValueOnce(null);

    const res = await auth(request(app).get("/api/profile/me")).expect(200);

    expect(res.body).toMatchObject({
      displayName: null,
      countryOfResidence: null,
      instagramVisible: false,
      telegramVisible: false,
      facebookVisible: false,
      emailVisible: false,
      phoneNumberVisible: false,
    });
  });

  it("upserts optional profile details and defaults omitted visibility toggles to private", async () => {
    prismaMock.userProfile.upsert.mockResolvedValueOnce({
      ...privateProfile,
      instagramVisible: false,
      emailVisible: false,
    });

    await auth(request(app).put("/api/profile/me").send({
      displayName: "John",
      countryOfResidence: "Singapore",
      instagram: "@john.cards",
      email: "john@example.com",
      telegramVisible: true,
    })).expect(200);

    expect(prismaMock.userProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1" },
      create: expect.objectContaining({
        userId: "user_1",
        instagram: "john.cards",
        instagramVisible: false,
        emailVisible: false,
        telegramVisible: true,
      }),
      update: expect.objectContaining({
        instagram: "john.cards",
        instagramVisible: false,
        emailVisible: false,
        telegramVisible: true,
      }),
    }));
  });

  it("requires a verified email before exposing profile contact fields", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", emailVerifiedAt: null });

    await auth(request(app).put("/api/profile/me").send({
      telegram: "johntelegram",
      telegramVisible: true,
    })).expect(403, { error: "Verified email required" });

    expect(prismaMock.userProfile.upsert).not.toHaveBeenCalled();
  });

  it("rejects unsafe profile image payloads and uploads valid edited images through storage abstraction", async () => {
    await auth(request(app).post("/api/profile/me/photo").send({
      contentType: "image/svg+xml",
      dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    })).expect(400, { error: "Unsupported image type" });

    await auth(request(app).post("/api/profile/me/photo").send({
      contentType: "image/png",
      dataUrl: "bad-payload",
    })).expect(400, { error: "Invalid image payload" });

    await auth(request(app).post("/api/profile/me/photo").send({
      contentType: "image/png",
      dataUrl: "data:image/jpeg;base64,AAAA",
    })).expect(400, { error: "Image content type mismatch" });

    await auth(request(app).post("/api/profile/me/photo").send({
      contentType: "image/png",
      dataUrl: `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`,
    })).expect(400, { error: "Image is too large" });

    await auth(request(app).post("/api/profile/me/photo").send({
      contentType: "image/png",
      dataUrl: "data:image/png;base64,",
    })).expect(400, { error: "Invalid image payload" });

    await auth(request(app).post("/api/profile/me/photo").send({
      dataUrl: "data:image/png;base64,AAAA",
    })).expect(400, { error: "dataUrl and contentType are required" });

    const dataUrl = `data:image/png;base64,${Buffer.from("edited-image").toString("base64")}`;
    prismaMock.userProfile.findUnique.mockResolvedValueOnce({ profileImageObjectKey: "old/key.png" });
    prismaMock.userProfile.upsert.mockResolvedValueOnce(privateProfile);

    const res = await auth(request(app).post("/api/profile/me/photo").send({ dataUrl, contentType: "image/png" })).expect(200);

    expect(res.body.profileImageUrl).toContain("/api/profile-images/");
    expect(uploadProfileImage).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      contentType: "image/png",
      buffer: expect.any(Buffer),
    }));
    expect(deleteProfileImage).toHaveBeenCalledWith("old/key.png");
  });

  it("deletes photos and reports persistence failures", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValueOnce(null);
    await auth(request(app).delete("/api/profile/me/photo")).expect(204);

    prismaMock.userProfile.findUnique.mockResolvedValueOnce({ profileImageObjectKey: "old/key.png" });
    prismaMock.userProfile.update.mockResolvedValueOnce({});
    await auth(request(app).delete("/api/profile/me/photo")).expect(204);
    expect(deleteProfileImage).toHaveBeenCalledWith("old/key.png");

    prismaMock.userProfile.findUnique.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/profile/me")).expect(500, { error: "Internal server error" });

    prismaMock.userProfile.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).put("/api/profile/me").send({ displayName: "John" })).expect(500, { error: "Internal server error" });

    prismaMock.userProfile.findUnique.mockResolvedValueOnce({ profileImageObjectKey: "old/key.png" });
    prismaMock.userProfile.update.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).delete("/api/profile/me/photo")).expect(500, { error: "Internal server error" });

    prismaMock.userProfile.findUnique.mockResolvedValueOnce(null);
    prismaMock.userProfile.upsert.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).post("/api/profile/me/photo").send({
      contentType: "image/png",
      dataUrl: `data:image/png;base64,${Buffer.from("edited-image").toString("base64")}`,
    })).expect(500, { error: "Internal server error" });
  });
});

describe("public collection profile payload", () => {
  it("builds empty and fully-visible public profile payloads", () => {
    expect(buildPublicProfile(null)).toEqual({});
    expect(buildPublicProfile({
      displayName: "Jane",
      profileImageUrl: "https://img",
      countryOfResidence: "Singapore",
      instagram: "jane",
      instagramVisible: true,
      telegram: "jane_tg",
      telegramVisible: true,
      facebook: "jane.fb",
      facebookVisible: true,
      email: "jane@example.com",
      emailVisible: true,
      phoneNumber: "+6500000000",
      phoneNumberVisible: true,
    })).toMatchObject({
      displayName: "Jane",
      profileImageUrl: "https://img",
      countryOfResidence: "Singapore",
      instagram: "jane",
      telegram: "jane_tg",
      facebook: "jane.fb",
      email: "jane@example.com",
      phoneNumber: "+6500000000",
    });
  });

  it("returns only visible profile fields", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user_1",
      username: "jw",
      publicEnabled: true,
      emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z"),
      profile: privateProfile,
    });
    prismaMock.inventoryEntry.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prismaMock.card.groupBy.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/public/collection/user_1").expect(200);

    expect(res.body.profile).toEqual({
      displayName: "Johnathan",
      profileImageUrl: "/api/profile-images/profile-images/user_1/avatar.png",
      countryOfResidence: "Singapore",
      instagram: "john.cards",
      telegram: "johntelegram",
    });
    expect(res.body.profile).not.toHaveProperty("email");
    expect(res.body.profile).not.toHaveProperty("phoneNumber");
    expect(res.body.profile).not.toHaveProperty("facebook");
  });

  it("does not expose public profile data for unverified users", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user_1",
      username: "jw",
      publicEnabled: true,
      emailVerifiedAt: null,
      profile: privateProfile,
    });

    await request(app).get("/api/public/collection/user_1").expect(404, { error: "Collection not found" });
    expect(prismaMock.inventoryEntry.findMany).not.toHaveBeenCalled();
  });
});
