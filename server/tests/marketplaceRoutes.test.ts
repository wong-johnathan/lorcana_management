import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const app = createApp();
const buyerToken = signToken({ userId: "buyer_1", username: "buyer" });
const sellerToken = signToken({ userId: "seller_1", username: "seller" });

function auth(req: request.Test, token = buyerToken) {
  return req.set("Authorization", `Bearer ${token}`);
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    status: "COMPLETED",
    completedAt: new Date("2026-08-01T00:00:00.000Z"),
    reviewWindowEndsAt: new Date("2026-08-31T00:00:00.000Z"),
    disputedAt: null,
    reviews: [],
    ...overrides,
  };
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "review_1",
    transactionId: "tx_1",
    reviewerId: "buyer_1",
    revieweeId: "seller_1",
    reviewerRole: "BUYER",
    rating: 5,
    comment: "Smooth deal",
    status: "SEALED",
    moderationStatus: "VISIBLE",
    submittedAt: new Date("2026-08-15T00:00:00.000Z"),
    revealedAt: null,
    tags: [{ tag: "FAST_RESPONSE" }],
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("marketplace trust routes", () => {
  it("requires authentication for review submission", async () => {
    await request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5 }).expect(401, { error: "Authentication required" });
  });

  it("creates a sealed buyer review only for completed marketplace deals", async () => {
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction({ status: "DISPUTED" }));
    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5, tags: ["FAST_RESPONSE"] }))
      .expect(400, { error: "Only completed marketplace deals can be reviewed" });

    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction());
    prismaMock.marketplaceReview.create.mockResolvedValueOnce(review());

    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 5, comment: " Smooth deal ", tags: ["FAST_RESPONSE"] }))
      .expect(201)
      .expect((res) => {
        expect(res.body.review).toEqual(expect.objectContaining({ status: "SEALED", rating: 5, publicContextLabel: "Completed marketplace deal" }));
        expect(JSON.stringify(res.body)).not.toMatch(/Verified Purchase|Payment Verified/i);
      });

    expect(prismaMock.marketplaceReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ transactionId: "tx_1", reviewerId: "buyer_1", revieweeId: "seller_1", reviewerRole: "BUYER", status: "SEALED" }),
    }));
  });

  it("reveals both sealed reviews immediately when the counterpart submits", async () => {
    const buyerReview = review({ id: "buyer_review" });
    prismaMock.marketplaceTransaction.findUnique.mockResolvedValueOnce(transaction({ reviews: [buyerReview] }));
    prismaMock.marketplaceReview.create.mockResolvedValueOnce(review({ id: "seller_review", reviewerId: "seller_1", revieweeId: "buyer_1", reviewerRole: "SELLER", status: "REVEALED" }));
    prismaMock.marketplaceReview.updateMany.mockResolvedValueOnce({ count: 1 });

    await auth(request(app).post("/api/marketplace/transactions/tx_1/reviews").send({ rating: 4, tags: ["FAST_PAYMENT"] }), sellerToken)
      .expect(201)
      .expect((res) => expect(res.body.review.status).toBe("REVEALED"));

    expect(prismaMock.marketplaceReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["buyer_review"] } },
      data: expect.objectContaining({ status: "REVEALED" }),
    }));
  });

  it("returns separate buyer and seller reputation aggregates", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "seller_1", createdAt: new Date("2026-01-01T00:00:00.000Z"), emailVerifiedAt: new Date("2026-01-02T00:00:00.000Z") });
    prismaMock.marketplaceReview.findMany.mockResolvedValueOnce([review({ status: "REVEALED", revealedAt: new Date("2026-08-02T00:00:00.000Z") })]);
    prismaMock.marketplaceTransaction.findMany.mockResolvedValueOnce([transaction()]);

    await request(app).get("/api/marketplace/users/seller_1/reputation")
      .expect(200)
      .expect((res) => {
        expect(res.body.seller.reviewCount).toBe(1);
        expect(res.body.seller.completedDealCount).toBe(1);
        expect(res.body.buyer.reviewCount).toBe(0);
        expect(res.body.publicContextLabel).toBe("Completed marketplace deal");
      });
  });

  it("reports reviews and moves moderation status under review", async () => {
    prismaMock.marketplaceReview.findUnique.mockResolvedValueOnce(review({ id: "review_1", reviewerId: "seller_1" }));
    prismaMock.marketplaceReport.create.mockResolvedValueOnce({ id: "report_1", status: "PENDING" });
    prismaMock.marketplaceReview.update.mockResolvedValueOnce(review({ id: "review_1", moderationStatus: "UNDER_REVIEW" }));

    await auth(request(app).post("/api/marketplace/reviews/review_1/report").send({ reason: "abusive", details: "bad language" }))
      .expect(201)
      .expect((res) => expect(res.body.report).toEqual({ id: "report_1", status: "PENDING" }));

    expect(prismaMock.marketplaceReport.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reporterId: "buyer_1", targetType: "MARKETPLACE_REVIEW", targetId: "review_1", reason: "abusive" }),
    }));
    expect(prismaMock.marketplaceReview.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "review_1" },
      data: { moderationStatus: "UNDER_REVIEW" },
    }));
  });
});
