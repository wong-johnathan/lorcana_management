export const MARKETPLACE_REPORT_TARGETS = ["MARKETPLACE_REVIEW", "MARKETPLACE_USER", "MARKETPLACE_TRANSACTION"] as const;
export type MarketplaceReportTarget = typeof MARKETPLACE_REPORT_TARGETS[number];

interface ReportInput {
  reason?: unknown;
  details?: unknown;
}

export function normalizeMarketplaceReportInput(input: ReportInput): { reason: string; details: string | null } {
  if (typeof input.reason !== "string" || !input.reason.trim()) throw new Error("reason is required");
  const reason = input.reason.trim();
  if (reason.length > 120) throw new Error("reason must be at most 120 characters");
  if (input.details !== undefined && input.details !== null && typeof input.details !== "string") throw new Error("details must be text");
  const details = typeof input.details === "string" && input.details.trim() ? input.details.trim() : null;
  if (details && details.length > 2000) throw new Error("details must be at most 2000 characters");
  return { reason, details };
}

export function buildReviewReportModerationPlan(args: { reporterId: string; reviewId: string; input: ReportInput }) {
  const normalized = normalizeMarketplaceReportInput(args.input);
  return {
    reportData: {
      reporterId: args.reporterId,
      targetType: "MARKETPLACE_REVIEW" as const,
      targetId: args.reviewId,
      reason: normalized.reason,
      details: normalized.details,
      status: "PENDING" as const,
    },
    reviewModerationStatus: "UNDER_REVIEW" as const,
  };
}

export function normalizeUserBlockInput(input: { blockerId: string; blockedId: string; reason?: unknown }): { blockerId: string; blockedId: string; reason: string | null } {
  if (!input.blockerId || !input.blockedId) throw new Error("blockerId and blockedId are required");
  if (input.blockerId === input.blockedId) throw new Error("Users cannot block themselves");
  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== "string") throw new Error("reason must be text");
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null;
  if (reason && reason.length > 500) throw new Error("reason must be at most 500 characters");
  return { blockerId: input.blockerId, blockedId: input.blockedId, reason };
}
