import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_REPORT_TARGETS,
  buildReviewReportModerationPlan,
  normalizeMarketplaceReportInput,
  normalizeUserBlockInput,
} from "../src/services/marketplaceModeration.js";

describe("marketplace moderation service", () => {
  it("normalizes review reports into an under-review moderation plan", () => {
    expect(MARKETPLACE_REPORT_TARGETS).toContain("MARKETPLACE_REVIEW");
    expect(normalizeMarketplaceReportInput({ reason: " abusive ", details: " Uses slurs " })).toEqual({ reason: "abusive", details: "Uses slurs" });
    expect(buildReviewReportModerationPlan({ reporterId: "buyer_1", reviewId: "review_1", input: { reason: "spam" } })).toEqual({
      reportData: {
        reporterId: "buyer_1",
        targetType: "MARKETPLACE_REVIEW",
        targetId: "review_1",
        reason: "spam",
        details: null,
        status: "PENDING",
      },
      reviewModerationStatus: "UNDER_REVIEW",
    });
  });

  it("rejects invalid report and block inputs", () => {
    expect(() => normalizeMarketplaceReportInput({ reason: "" })).toThrow("reason is required");
    expect(() => normalizeMarketplaceReportInput({ reason: "x".repeat(121) })).toThrow("reason must be at most 120 characters");
    expect(() => normalizeMarketplaceReportInput({ reason: "spam", details: 123 })).toThrow("details must be text");
    expect(() => normalizeMarketplaceReportInput({ reason: "spam", details: "x".repeat(2001) })).toThrow("details must be at most 2000 characters");
    expect(() => normalizeUserBlockInput({ blockerId: "", blockedId: "user_2" })).toThrow("blockerId and blockedId are required");
    expect(() => normalizeUserBlockInput({ blockerId: "user_1", blockedId: "user_1" })).toThrow("Users cannot block themselves");
    expect(() => normalizeUserBlockInput({ blockerId: "user_1", blockedId: "user_2", reason: 123 })).toThrow("reason must be text");
    expect(() => normalizeUserBlockInput({ blockerId: "user_1", blockedId: "user_2", reason: "x".repeat(501) })).toThrow("reason must be at most 500 characters");
  });

  it("creates user block records without leaking private profile data", () => {
    expect(normalizeUserBlockInput({ blockerId: "buyer_1", blockedId: "seller_1", reason: " Harassment " })).toEqual({
      blockerId: "buyer_1",
      blockedId: "seller_1",
      reason: "Harassment",
    });
  });
});
