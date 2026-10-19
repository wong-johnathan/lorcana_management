import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/services/objectStorage.js", () => ({
  LOCAL_UPLOAD_ROOT: "/tmp/lorcana-marketplace-admin-test-uploads",
  ALLOWED_IMAGE_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"],
  MAX_PROFILE_IMAGE_BYTES: 5 * 1024 * 1024,
  MAX_LISTING_PHOTO_COUNT: 8,
  MAX_LISTING_PHOTO_BYTES: 5 * 1024 * 1024,
  uploadProfileImage: vi.fn(),
  deleteProfileImage: vi.fn(),
  uploadListingPhoto: vi.fn(),
  deleteListingPhoto: vi.fn(),
  cardImageExists: vi.fn(),
  cardImagePublicUrl: vi.fn((key: string) => `/api/profile-images/${key}`),
  makeCardImageObjectKey: vi.fn(),
  uploadCardImage: vi.fn(),
}));

// Isolate the route under test from the B2 disable service (covered by
// marketplaceTransitions.test.ts). importOriginal keeps the real
// `MarketplaceError` so the route's error mapping still works.
vi.mock("../src/services/marketplaceTransitions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/marketplaceTransitions.js")>();
  return { ...actual, disableUser: vi.fn() };
});

import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";
import { disableUser } from "../src/services/marketplaceTransitions.js";

const app = createApp();
const operatorToken = signToken({ userId: "operator1", username: "operator" });
const regularToken = signToken({ userId: "user1", username: "user" });

function auth(req: request.Test, value = operatorToken) {
  return req.set("Authorization", `Bearer ${value}`);
}

beforeEach(() => {
  resetPrismaMock();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.mocked(disableUser).mockReset();
});

describe("marketplace admin authorization (authenticateOperator)", () => {
  it("rejects anonymous admin requests with 401", async () => {
    await request(app).get("/api/marketplace/admin/reports").expect(401, { error: "Authentication required" });
    await request(app).post("/api/marketplace/admin/listings/listing1/takedown").expect(401, { error: "Authentication required" });
    await request(app).post("/api/marketplace/admin/users/user1/disable").expect(401, { error: "Authentication required" });
  });

  it("rejects a non-operator token with 403 on every admin endpoint", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isOperator: false });

    await auth(request(app).get("/api/marketplace/admin/reports"), regularToken)
      .expect(403, { error: "Operator access required" });
    await auth(request(app).post("/api/marketplace/admin/listings/listing1/takedown"), regularToken)
      .expect(403, { error: "Operator access required" });
    await auth(request(app).post("/api/marketplace/admin/users/user1/disable"), regularToken)
      .expect(403, { error: "Operator access required" });
  });
});

describe("marketplace admin reports (AC-22.2)", () => {
  it("lists reports and applies status/targetType filters", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    prismaMock.marketplaceReport.findMany.mockResolvedValueOnce([
      { id: "report1", status: "OPEN", targetType: "LISTING", targetId: "listing1", reporter: { id: "reporter1", username: "reporter" } },
    ]);

    const res = await auth(
      request(app).get("/api/marketplace/admin/reports").query({ status: "OPEN", targetType: "LISTING" })
    ).expect(200);

    expect(res.body.reports).toHaveLength(1);
    expect(prismaMock.marketplaceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "OPEN", targetType: "LISTING" },
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("rejects an invalid status or targetType filter", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    await auth(request(app).get("/api/marketplace/admin/reports").query({ status: "BOGUS" }))
      .expect(400, { error: "Invalid report status" });

    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    await auth(request(app).get("/api/marketplace/admin/reports").query({ targetType: "CARD" }))
      .expect(400, { error: "Invalid target type" });
  });
});

describe("marketplace admin takedown (AC-22.2)", () => {
  it("hides the listing and resolves its linked reports atomically", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce({ id: "listing1", status: "ACTIVE" });
    prismaMock.marketplaceListing.update.mockResolvedValueOnce({ id: "listing1" });
    prismaMock.marketplaceReport.updateMany.mockResolvedValueOnce({ count: 3 });

    const res = await auth(
      request(app).post("/api/marketplace/admin/listings/listing1/takedown")
    ).expect(200);

    expect(res.body).toEqual({ id: "listing1", hiddenAt: true, resolvedReports: 3 });
    expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith({
      where: { id: "listing1" },
      data: { hiddenAt: expect.any(Date) },
    });
    expect(prismaMock.marketplaceReport.updateMany).toHaveBeenCalledWith({
      where: { targetType: "LISTING", targetId: "listing1", status: "OPEN" },
      data: { status: "RESOLVED" },
    });
  });

  it("returns 404 for a missing listing", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    prismaMock.marketplaceListing.findUnique.mockResolvedValueOnce(null);

    await auth(request(app).post("/api/marketplace/admin/listings/missing/takedown"))
      .expect(404, { error: "Listing not found" });
  });
});

describe("marketplace admin disable user (REQ-24 / AC-24.1)", () => {
  it("delegates to B2 disableUser and returns the cancellation count", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true }); // operator gate
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user1" }); // target existence
    vi.mocked(disableUser).mockResolvedValueOnce({ userId: "user1", cancelled: 2 });

    const res = await auth(
      request(app).post("/api/marketplace/admin/users/user1/disable")
    ).expect(200);

    expect(res.body).toEqual({ userId: "user1", cancelled: 2 });
    expect(disableUser).toHaveBeenCalledWith("user1");
    // AC-24.1 (disabledAt set + SYSTEM-cancelled pending tx) is asserted at the
    // service layer in marketplaceTransitions.test.ts.
  });

  it("returns 404 for a missing user", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await auth(request(app).post("/api/marketplace/admin/users/missing/disable"))
      .expect(404, { error: "User not found" });
    expect(disableUser).not.toHaveBeenCalled();
  });
});

describe("marketplace admin reports — no filters", () => {
  it("lists reports without status/targetType filters", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    prismaMock.marketplaceReport.findMany.mockResolvedValueOnce([]);

    await auth(request(app).get("/api/marketplace/admin/reports")).expect(200);

    expect(prismaMock.marketplaceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { createdAt: "desc" } })
    );
  });
});

describe("marketplace admin — non-MarketplaceError maps to 500", () => {
  it("returns 500 for an unexpected failure", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isOperator: true });
    prismaMock.marketplaceReport.findMany.mockRejectedValueOnce(new Error("db exploded"));

    await auth(request(app).get("/api/marketplace/admin/reports")).expect(500, {
      error: "Internal server error",
    });
  });
});
