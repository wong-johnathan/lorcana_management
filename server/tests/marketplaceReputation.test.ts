import { describe, expect, it } from "vitest";
import {
  calculateRoleReputation,
  buildMarketplaceReputation,
} from "../src/services/marketplaceReputation.js";

const user = { id: "user_1", createdAt: new Date("2026-01-01T00:00:00.000Z"), emailVerifiedAt: new Date("2026-01-02T00:00:00.000Z") };

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "review_1",
    transactionId: "tx_1",
    reviewerId: "counterparty_1",
    revieweeId: "user_1",
    reviewerRole: "BUYER",
    rating: 5,
    status: "REVEALED",
    moderationStatus: "VISIBLE",
    submittedAt: new Date("2026-08-01T00:00:00.000Z"),
    revealedAt: new Date("2026-08-02T00:00:00.000Z"),
    transaction: { id: "tx_1", buyerId: "counterparty_1", sellerId: "user_1", status: "COMPLETED", completedAt: new Date("2026-08-01T00:00:00.000Z") },
    tags: [],
    ...overrides,
  };
}

function tx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx_1",
    buyerId: "counterparty_1",
    sellerId: "user_1",
    status: "COMPLETED",
    completedAt: new Date("2026-08-01T00:00:00.000Z"),
    disputedAt: null,
    ...overrides,
  };
}

describe("marketplace reputation service", () => {
  it("calculates buyer and seller reputation aggregates separately and excludes hidden reviews", () => {
    const seller = calculateRoleReputation({
      role: "SELLER",
      userId: "user_1",
      userCreatedAt: user.createdAt,
      emailVerifiedAt: user.emailVerifiedAt,
      now: new Date("2026-08-27T00:00:00.000Z"),
      reviewsReceived: [review({ rating: 5 }), review({ id: "review_2", rating: 3 }), review({ id: "hidden", rating: 1, moderationStatus: "HIDDEN" })],
      completedTransactions: [tx({ id: "tx_1", buyerId: "buyer_a" }), tx({ id: "tx_2", buyerId: "buyer_a" }), tx({ id: "tx_3", buyerId: "buyer_b" })],
    });

    expect(seller).toEqual(expect.objectContaining({
      role: "SELLER",
      ratingAverage: 4,
      reviewCount: 2,
      completedDealCount: 3,
      uniqueCounterpartyCount: 2,
      emailVerified: true,
      publicContextLabel: "Completed marketplace deal",
    }));
    expect(seller.conservativeScore).toBeLessThan(4);
    expect(seller.suspiciousRepeatCounterpartyCount).toBe(1);
  });

  it("builds a public reputation summary with independent buyer and seller sections", () => {
    const summary = buildMarketplaceReputation({
      user,
      now: new Date("2026-08-27T00:00:00.000Z"),
      reviewsReceived: [
        review({ id: "seller_review", reviewerRole: "BUYER", rating: 5, transaction: tx({ id: "sale_1", buyerId: "buyer_1" }) }),
        review({ id: "buyer_review", reviewerRole: "SELLER", rating: 2, transaction: tx({ id: "purchase_1", buyerId: "user_1", sellerId: "seller_1" }) }),
      ],
      completedTransactions: [
        tx({ id: "sale_1", buyerId: "buyer_1", sellerId: "user_1" }),
        tx({ id: "purchase_1", buyerId: "user_1", sellerId: "seller_1" }),
        tx({ id: "disputed", buyerId: "buyer_2", sellerId: "user_1", disputedAt: new Date("2026-08-05T00:00:00.000Z") }),
      ],
    });

    expect(summary.userId).toBe("user_1");
    expect(summary.seller.ratingAverage).toBe(5);
    expect(summary.seller.completedDealCount).toBe(1);
    expect(summary.buyer.ratingAverage).toBe(2);
    expect(summary.buyer.completedDealCount).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/Verified Purchase|Payment Verified/i);

    const empty = buildMarketplaceReputation({ user: { id: "new_user", createdAt: null, emailVerifiedAt: null }, now: new Date("2026-08-27T00:00:00.000Z"), reviewsReceived: [], completedTransactions: [] });
    expect(empty.memberSince).toBeNull();
    expect(empty.emailVerified).toBe(false);
    expect(empty.seller.ratingAverage).toBeNull();
    expect(empty.seller.accountAgeDays).toBe(0);
  });
});
