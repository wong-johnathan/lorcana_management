export const REVIEW_WINDOW_DAYS = 30;
export const PUBLIC_REVIEW_CONTEXT_LABEL = "Completed marketplace deal";

export const BUYER_REVIEW_TAGS = [
  "FAST_RESPONSE",
  "ACCURATE_DESCRIPTION",
  "CONDITION_AS_DESCRIBED",
  "WELL_PACKED",
  "SMOOTH_MEETUP",
  "FRIENDLY_SELLER",
  "SLOW_RESPONSE",
  "CONDITION_DIFFERED",
  "FULFILMENT_ISSUE",
] as const;

export const SELLER_REVIEW_TAGS = [
  "FAST_PAYMENT",
  "GOOD_COMMUNICATION",
  "ARRIVED_ON_TIME",
  "SMOOTH_TRANSACTION",
  "RESPECTFUL_BUYER",
  "SLOW_RESPONSE",
  "MISSED_MEETUP",
  "PAYMENT_ISSUE",
] as const;

type BuyerReviewTag = typeof BUYER_REVIEW_TAGS[number];
type SellerReviewTag = typeof SELLER_REVIEW_TAGS[number];
export type MarketplaceReviewTag = BuyerReviewTag | SellerReviewTag;
export type ReviewerRole = "BUYER" | "SELLER";
export type ReviewStatus = "SEALED" | "REVEALED" | "FROZEN" | "HIDDEN" | "UNDER_REVIEW";

export interface ReviewableTransaction {
  id: string;
  buyerId: string;
  sellerId: string;
  status: string;
  completedAt: Date | string | null;
  disputedAt?: Date | string | null;
  reviewWindowEndsAt?: Date | string | null;
}

export interface MarketplaceReviewLike {
  id: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  reviewerRole: string;
  rating: number;
  status: string;
  moderationStatus?: string | null;
  submittedAt?: Date | string | null;
  revealedAt?: Date | string | null;
}

export interface ReviewInput {
  rating: unknown;
  comment?: unknown;
  tags?: unknown;
}

export interface NormalizedReviewInput {
  rating: number;
  comment: string | null;
  tags: MarketplaceReviewTag[];
  publicContextLabel: typeof PUBLIC_REVIEW_CONTEXT_LABEL;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function addReviewWindow(completedAt: Date): Date {
  const deadline = new Date(completedAt);
  deadline.setUTCDate(deadline.getUTCDate() + REVIEW_WINDOW_DAYS);
  return deadline;
}

export function reviewWindowEndsAt(transaction: ReviewableTransaction): Date {
  const explicit = asDate(transaction.reviewWindowEndsAt);
  if (explicit) return explicit;
  const completedAt = asDate(transaction.completedAt);
  if (!completedAt) throw new Error("Completed marketplace deal is missing completion time");
  return addReviewWindow(completedAt);
}

export function determineReviewParties(transaction: Pick<ReviewableTransaction, "buyerId" | "sellerId">, actorUserId: string): { reviewerRole: ReviewerRole; revieweeId: string } {
  if (actorUserId === transaction.buyerId) return { reviewerRole: "BUYER", revieweeId: transaction.sellerId };
  if (actorUserId === transaction.sellerId) return { reviewerRole: "SELLER", revieweeId: transaction.buyerId };
  throw new Error("Only transaction participants can review");
}

export function validateReviewInput(input: ReviewInput, reviewerRole: ReviewerRole): NormalizedReviewInput {
  if (typeof input.rating !== "number" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("rating must be an integer from 1 to 5");
  }
  if (input.comment !== undefined && input.comment !== null && typeof input.comment !== "string") {
    throw new Error("comment must be text");
  }
  const comment = typeof input.comment === "string" && input.comment.trim() ? input.comment.trim() : null;
  if (comment && comment.length > 2000) throw new Error("comment must be at most 2000 characters");

  const rawTags = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(rawTags)) throw new Error("tags must be an array");
  const allowed = reviewerRole === "BUYER" ? BUYER_REVIEW_TAGS : SELLER_REVIEW_TAGS;
  const seen = new Set<string>();
  const tags: MarketplaceReviewTag[] = [];
  for (const tag of rawTags) {
    if (typeof tag !== "string" || !(allowed as readonly string[]).includes(tag)) {
      throw new Error(`Invalid review tag for ${reviewerRole.toLowerCase()} review`);
    }
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag as MarketplaceReviewTag);
    }
  }

  return { rating: input.rating, comment, tags, publicContextLabel: PUBLIC_REVIEW_CONTEXT_LABEL };
}

export function transactionHasOpenDispute(transaction: ReviewableTransaction): boolean {
  return transaction.status === "DISPUTED" || Boolean(transaction.disputedAt);
}

export function assertReviewableTransaction(transaction: ReviewableTransaction, actorUserId: string, now: Date): { reviewerRole: ReviewerRole; revieweeId: string; deadline: Date } {
  if (transaction.status !== "COMPLETED") throw new Error("Only completed marketplace deals can be reviewed");
  if (transactionHasOpenDispute(transaction)) throw new Error("Reviews are frozen while a dispute is open");
  const parties = determineReviewParties(transaction, actorUserId);
  const deadline = reviewWindowEndsAt(transaction);
  if (now > deadline) throw new Error("The review window has closed");
  return { ...parties, deadline };
}

export function planReviewSubmission(args: {
  transaction: ReviewableTransaction;
  actorUserId: string;
  existingReview: MarketplaceReviewLike | null;
  counterpartReview: MarketplaceReviewLike | null;
  now: Date;
  input: ReviewInput;
}) {
  const parties = assertReviewableTransaction(args.transaction, args.actorUserId, args.now);
  if (args.existingReview && args.existingReview.status !== "SEALED" && args.existingReview.status !== "FROZEN") {
    throw new Error("Revealed reviews are locked");
  }
  const normalized = validateReviewInput(args.input, parties.reviewerRole);
  const shouldRevealNow = Boolean(args.counterpartReview && !transactionHasOpenDispute(args.transaction));
  return {
    mode: args.existingReview ? "update" as const : "create" as const,
    reviewData: {
      transactionId: args.transaction.id,
      reviewerId: args.actorUserId,
      revieweeId: parties.revieweeId,
      reviewerRole: parties.reviewerRole,
      rating: normalized.rating,
      comment: normalized.comment,
      status: shouldRevealNow ? "REVEALED" : "SEALED",
      moderationStatus: "VISIBLE",
      submittedAt: args.now,
      revealedAt: shouldRevealNow ? args.now : null,
    },
    tags: normalized.tags,
    revealReviewIds: shouldRevealNow && args.counterpartReview ? [args.counterpartReview.id] : [],
    publicContextLabel: PUBLIC_REVIEW_CONTEXT_LABEL,
  };
}

export function getReviewVisibility(review: MarketplaceReviewLike, transaction: ReviewableTransaction, now: Date): { isPublic: boolean; effectiveStatus: ReviewStatus; shouldPersistReveal: boolean } {
  if (review.moderationStatus === "HIDDEN" || review.status === "HIDDEN") {
    return { isPublic: false, effectiveStatus: "HIDDEN", shouldPersistReveal: false };
  }
  if (transactionHasOpenDispute(transaction)) {
    return { isPublic: false, effectiveStatus: "FROZEN", shouldPersistReveal: false };
  }
  if (review.status === "REVEALED" || review.moderationStatus === "VISIBLE") {
    if (review.status === "REVEALED") return { isPublic: true, effectiveStatus: "REVEALED", shouldPersistReveal: false };
  }
  if (review.status === "SEALED" && now > reviewWindowEndsAt(transaction)) {
    return { isPublic: true, effectiveStatus: "REVEALED", shouldPersistReveal: true };
  }
  return { isPublic: false, effectiveStatus: review.status === "FROZEN" ? "FROZEN" : "SEALED", shouldPersistReveal: false };
}

export function serializeReview(review: MarketplaceReviewLike, publicContextLabel = PUBLIC_REVIEW_CONTEXT_LABEL) {
  return { ...review, publicContextLabel };
}
