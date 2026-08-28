import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/services/objectStorage.js", () => ({
  uploadProfileImage: vi.fn().mockResolvedValue({
    objectKey: "profile-images/user_1/avatar.png",
    publicUrl: "/api/profile-images/profile-images/user_1/avatar.png",
  }),
  deleteProfileImage: vi.fn().mockResolvedValue(undefined),
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

const visibleReference = {
  id: "ref_1",
  userId: "user_1",
  name: "Alice",
  description: "Trade reference",
  contactInfo: "@alice",
  visible: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
};

beforeEach(() => {
  resetPrismaMock();
  prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z") });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("profile routes", () => {
  it("requires auth and returns the owner profile with private fields and references", async () => {
    await request(app).get("/api/profile/me").expect(401, { error: "Authentication required" });

    prismaMock.userProfile.findUnique.mockResolvedValueOnce(privateProfile);
    prismaMock.userReference.findMany.mockResolvedValueOnce([visibleReference]);

    const res = await auth(request(app).get("/api/profile/me")).expect(200);

    expect(res.body.email).toBe("john@example.com");
    expect(res.body.emailVisible).toBe(false);
    expect(res.body.references).toEqual([
      expect.objectContaining({ id: "ref_1", name: "Alice", visible: true }),
    ]);
    expect(prismaMock.userProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "user_1" } });
  });

  it("creates an empty owner profile response when profile rows do not exist yet", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValueOnce(null);
    prismaMock.userReference.findMany.mockResolvedValueOnce([]);

    const res = await auth(request(app).get("/api/profile/me")).expect(200);

    expect(res.body).toMatchObject({
      displayName: null,
      countryOfResidence: null,
      instagramVisible: false,
      telegramVisible: false,
      facebookVisible: false,
      emailVisible: false,
      phoneNumberVisible: false,
      references: [],
    });
  });

  it("upserts optional profile details and defaults omitted visibility toggles to private", async () => {
    prismaMock.userProfile.upsert.mockResolvedValueOnce({
      ...privateProfile,
      instagramVisible: false,
      emailVisible: false,
    });
    prismaMock.userReference.findMany.mockResolvedValueOnce([]);

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
    prismaMock.userReference.findMany.mockResolvedValueOnce([]);

    const res = await auth(request(app).post("/api/profile/me/photo").send({ dataUrl, contentType: "image/png" })).expect(200);

    expect(res.body.profileImageUrl).toContain("/api/profile-images/");
    expect(uploadProfileImage).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      contentType: "image/png",
      buffer: expect.any(Buffer),
    }));
    expect(deleteProfileImage).toHaveBeenCalledWith("old/key.png");
  });

  it("manages user supplied references with ownership checks", async () => {
    prismaMock.userReference.create.mockResolvedValueOnce(visibleReference);
    await auth(request(app).post("/api/profile/me/references").send({
      name: "Alice",
      description: "Trade reference",
      contactInfo: "@alice",
      visible: true,
    })).expect(201).expect((res) => expect(res.body.name).toBe("Alice"));

    prismaMock.userReference.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).put("/api/profile/me/references/missing").send({ name: "Bob" })).expect(404, { error: "Reference not found" });

    prismaMock.userReference.findFirst.mockResolvedValueOnce(visibleReference);
    prismaMock.userReference.update.mockResolvedValueOnce({ ...visibleReference, visible: false });
    await auth(request(app).put("/api/profile/me/references/ref_1").send({ visible: false })).expect(200).expect((res) => expect(res.body.visible).toBe(false));

    prismaMock.userReference.findFirst.mockResolvedValueOnce(visibleReference);
    prismaMock.userReference.delete.mockResolvedValueOnce(visibleReference);
    await auth(request(app).delete("/api/profile/me/references/ref_1")).expect(204);
  });

  it("requires a verified email before creating visible trade references", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1", emailVerifiedAt: null });

    await auth(request(app).post("/api/profile/me/references").send({
      name: "Alice",
      contactInfo: "@alice",
      visible: true,
    })).expect(403, { error: "Verified email required" });

    expect(prismaMock.userReference.create).not.toHaveBeenCalled();
  });

  it("rejects invalid references, deletes photos, and reports persistence failures", async () => {
    await auth(request(app).post("/api/profile/me/references").send({ name: "" })).expect(400, { error: "Reference name is required" });

    prismaMock.userReference.findFirst.mockResolvedValueOnce(visibleReference);
    await auth(request(app).put("/api/profile/me/references/ref_1").send({ name: "" })).expect(400, { error: "Reference name is required" });

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

    prismaMock.userReference.findMany.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).get("/api/profile/me/references")).expect(500, { error: "Internal server error" });

    prismaMock.userReference.create.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).post("/api/profile/me/references").send({ name: "Alice" })).expect(500, { error: "Internal server error" });

    prismaMock.userReference.findFirst.mockResolvedValueOnce(visibleReference);
    prismaMock.userReference.update.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).put("/api/profile/me/references/ref_1").send({ visible: true })).expect(500, { error: "Internal server error" });

    prismaMock.userReference.findFirst.mockResolvedValueOnce(null);
    await auth(request(app).delete("/api/profile/me/references/missing")).expect(404, { error: "Reference not found" });

    prismaMock.userReference.findFirst.mockResolvedValueOnce(visibleReference);
    prismaMock.userReference.delete.mockRejectedValueOnce(new Error("db"));
    await auth(request(app).delete("/api/profile/me/references/ref_1")).expect(500, { error: "Internal server error" });
  });
});

describe("public collection profile payload", () => {
  it("builds empty and fully-visible public profile payloads", () => {
    expect(buildPublicProfile(null, [])).toEqual({});
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
    }, [visibleReference])).toMatchObject({
      displayName: "Jane",
      profileImageUrl: "https://img",
      countryOfResidence: "Singapore",
      instagram: "jane",
      telegram: "jane_tg",
      facebook: "jane.fb",
      email: "jane@example.com",
      phoneNumber: "+6500000000",
      references: [expect.objectContaining({ id: "ref_1" })],
    });
  });

  it("returns only visible profile fields and visible user-provided references", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user_1",
      username: "jw",
      publicEnabled: true,
      emailVerifiedAt: new Date("2026-08-28T00:00:00.000Z"),
      profile: privateProfile,
      references: [
        visibleReference,
        { ...visibleReference, id: "ref_2", name: "Private ref", visible: false },
      ],
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
      references: [{ id: "ref_1", name: "Alice", description: "Trade reference", contactInfo: "@alice" }],
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
      references: [visibleReference],
    });

    await request(app).get("/api/public/collection/user_1").expect(404, { error: "Collection not found" });
    expect(prismaMock.inventoryEntry.findMany).not.toHaveBeenCalled();
  });
});
