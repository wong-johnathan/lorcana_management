import { describe, expect, it } from "vitest";
import {
  BUYER_REVIEW_TAGS,
  SELLER_REVIEW_TAGS,
  REVIEW_WINDOW_DAYS,
  determineReviewParties,
  getReviewVisibility,
  planReviewSubmission,
  validateReviewInput,
} from "../src/services/marketplaceReviews.js";

const completedAt = new Date("2026-08-01T00:00:00.000Z");
const withinWindow = new Date("2026-08-15T00:00:00.000Z");
const afterWindow = new Date("2026-09-01T00:00:01.000Z");

function tx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx_1",
    buyerId: "buyer_1",
    sellerId: "seller_1",
    status: "COMPLETED",
    completedAt,
    disputedAt: null,
    reviewWindowEndsAt: new Date("2026-08-31T00:00:00.000Z"),
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
    status: "SEALED",
    moderationStatus: "VISIBLE",
    submittedAt: withinWindow,
    revealedAt: null,
    tags: [{ tag: "FAST_RESPONSE" }],
    ...overrides,
  };
}

describe("marketplace review service", () => {
  it("allows only completed marketplace deal participants to review during the 30-day window", () => {
    expect(REVIEW_WINDOW_DAYS).toBe(30);
    expect(determineReviewParties(tx(), "buyer_1")).toEqual({ reviewerRole: "BUYER", revieweeId: "seller_1" });
    expect(determineReviewParties(tx(), "seller_1")).toEqual({ reviewerRole: "SELLER", revieweeId: "buyer_1" });
    expect(() => determineReviewParties(tx(), "stranger")).toThrow("Only transaction participants can review");

    expect(() => planReviewSubmission({
      transaction: tx({ status: "AWAITING_BUYER_CONFIRMATION" }),
      actorUserId: "buyer_1",
      existingReview: null,
      counterpartReview: null,
      now: withinWindow,
      input: { rating: 5, tags: ["FAST_RESPONSE"] },
    })).toThrow("Only completed marketplace deals can be reviewed");

    expect(() => planReviewSubmission({
      transaction: tx({ disputedAt: new Date("2026-08-20T00:00:00.000Z") }),
      actorUserId: "buyer_1",
      existingReview: null,
      counterpartReview: null,
      now: withinWindow,
      input: { rating: 5, tags: ["FAST_RESPONSE"] },
    })).toThrow("Reviews are frozen while a dispute is open");

    expect(() => planReviewSubmission({
      transaction: tx(),
      actorUserId: "buyer_1",
      existingReview: null,
      counterpartReview: null,
      now: afterWindow,
      input: { rating: 5, tags: ["FAST_RESPONSE"] },
    })).toThrow("The review window has closed");
  });

  it("validates ratings and role-specific tags without using verified-purchase language", () => {
    expect(BUYER_REVIEW_TAGS).toContain("CONDITION_AS_DESCRIBED");
    expect(SELLER_REVIEW_TAGS).toContain("FAST_PAYMENT");
    expect(validateReviewInput({ rating: 4, comment: " Smooth deal ", tags: ["FAST_RESPONSE", "WELL_PACKED", "FAST_RESPONSE"] }, "BUYER")).toEqual({
      rating: 4,
      comment: "Smooth deal",
      tags: ["FAST_RESPONSE", "WELL_PACKED"],
      publicContextLabel: "Completed marketplace deal",
    });
    expect(validateReviewInput({ rating: 3 }, "BUYER")).toEqual({ rating: 3, comment: null, tags: [], publicContextLabel: "Completed marketplace deal" });
    expect(() => validateReviewInput({ rating: 6 }, "BUYER")).toThrow("rating must be an integer from 1 to 5");
    expect(() => validateReviewInput({ rating: 5, comment: 123 }, "BUYER")).toThrow("comment must be text");
    expect(() => validateReviewInput({ rating: 5, comment: "x".repeat(2001) }, "BUYER")).toThrow("comment must be at most 2000 characters");
    expect(() => validateReviewInput({ rating: 5, tags: "FAST_RESPONSE" }, "BUYER")).toThrow("tags must be an array");
    expect(() => validateReviewInput({ rating: 5, tags: ["FAST_PAYMENT"] }, "BUYER")).toThrow("Invalid review tag for buyer review");
    expect(validateReviewInput({ rating: 5, tags: ["FAST_PAYMENT"] }, "SELLER").publicContextLabel).not.toMatch(/verified purchase|payment verified/i);
  });

  it("keeps the first review sealed, reveals both immediately after counterpart submission, and locks revealed reviews", () => {
    const first = planReviewSubmission({
      transaction: tx(),
      actorUserId: "buyer_1",
      existingReview: null,
      counterpartReview: null,
      now: withinWindow,
      input: { rating: 5, tags: ["FAST_RESPONSE"] },
    });
    expect(first.reviewData).toEqual(expect.objectContaining({ status: "SEALED", reviewerRole: "BUYER", revieweeId: "seller_1" }));
    expect(first.revealReviewIds).toEqual([]);

    const second = planReviewSubmission({
      transaction: tx(),
      actorUserId: "seller_1",
      existingReview: null,
      counterpartReview: review({ id: "buyer_review" }),
      now: withinWindow,
      input: { rating: 4, tags: ["FAST_PAYMENT"] },
    });
    expect(second.reviewData.status).toBe("REVEALED");
    expect(second.revealReviewIds).toEqual(["buyer_review"]);

    expect(() => planReviewSubmission({
      transaction: tx(),
      actorUserId: "buyer_1",
      existingReview: review({ status: "REVEALED" }),
      counterpartReview: review({ id: "seller_review", reviewerId: "seller_1", revieweeId: "buyer_1", reviewerRole: "SELLER" }),
      now: withinWindow,
      input: { rating: 3, tags: ["SLOW_RESPONSE"] },
    })).toThrow("Revealed reviews are locked");
  });

  it("reveals lone sealed reviews after 30 days but freezes reveal during disputes", () => {
    expect(getReviewVisibility(review(), tx(), afterWindow)).toEqual({ isPublic: true, effectiveStatus: "REVEALED", shouldPersistReveal: true });
    expect(getReviewVisibility(review(), tx({ disputedAt: new Date("2026-08-20T00:00:00.000Z") }), afterWindow)).toEqual({ isPublic: false, effectiveStatus: "FROZEN", shouldPersistReveal: false });
    expect(getReviewVisibility(review({ moderationStatus: "HIDDEN" }), tx(), afterWindow)).toEqual({ isPublic: false, effectiveStatus: "HIDDEN", shouldPersistReveal: false });
    expect(getReviewVisibility(review({ status: "HIDDEN" }), tx(), afterWindow)).toEqual({ isPublic: false, effectiveStatus: "HIDDEN", shouldPersistReveal: false });
    expect(getReviewVisibility(review({ status: "REVEALED", revealedAt: withinWindow }), tx(), withinWindow)).toEqual({ isPublic: true, effectiveStatus: "REVEALED", shouldPersistReveal: false });
    expect(getReviewVisibility(review({ status: "FROZEN" }), tx(), withinWindow)).toEqual({ isPublic: false, effectiveStatus: "FROZEN", shouldPersistReveal: false });
    expect(() => getReviewVisibility(review(), tx({ reviewWindowEndsAt: null, completedAt: null }), afterWindow)).toThrow("Completed marketplace deal is missing completion time");
  });
});
