import { PUBLIC_REVIEW_CONTEXT_LABEL, getReviewVisibility, type MarketplaceReviewLike, type ReviewableTransaction } from "./marketplaceReviews.js";

export type ReputationRole = "BUYER" | "SELLER";

interface UserLike {
  id: string;
  createdAt?: Date | string | null;
  emailVerifiedAt?: Date | string | null;
}

interface ReviewWithTransaction extends MarketplaceReviewLike {
  transaction?: ReviewableTransaction | null;
}

interface TransactionLike extends ReviewableTransaction {
  buyerId: string;
  sellerId: string;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isCompleted(transaction: TransactionLike): boolean {
  return transaction.status === "COMPLETED" && !transaction.disputedAt;
}

function visibleReviewsForRole(reviews: ReviewWithTransaction[], role: ReputationRole, now: Date): ReviewWithTransaction[] {
  return reviews.filter((review) => {
    if (role === "SELLER" && review.reviewerRole !== "BUYER") return false;
    if (role === "BUYER" && review.reviewerRole !== "SELLER") return false;
    const transaction = review.transaction;
    if (!transaction) return review.status === "REVEALED" && review.moderationStatus !== "HIDDEN";
    return getReviewVisibility(review, transaction, now).isPublic;
  });
}

function completedTransactionsForRole(transactions: TransactionLike[], userId: string, role: ReputationRole): TransactionLike[] {
  return transactions.filter((transaction) => {
    if (!isCompleted(transaction)) return false;
    return role === "SELLER" ? transaction.sellerId === userId : transaction.buyerId === userId;
  });
}

function uniqueCounterparties(transactions: TransactionLike[], userId: string): Set<string> {
  const ids = new Set<string>();
  for (const transaction of transactions) {
    ids.add(transaction.buyerId === userId ? transaction.sellerId : transaction.buyerId);
  }
  return ids;
}

function suspiciousRepeatCounterpartyCount(transactions: TransactionLike[], userId: string): number {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    const counterparty = transaction.buyerId === userId ? transaction.sellerId : transaction.buyerId;
    counts.set(counterparty, (counts.get(counterparty) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function accountAgeDays(createdAt: Date | string | null | undefined, now: Date): number {
  const created = asDate(createdAt);
  if (!created) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

export function calculateRoleReputation(args: {
  role: ReputationRole;
  userId: string;
  userCreatedAt?: Date | string | null;
  emailVerifiedAt?: Date | string | null;
  now: Date;
  reviewsReceived: ReviewWithTransaction[];
  completedTransactions: TransactionLike[];
}) {
  const reviews = visibleReviewsForRole(args.reviewsReceived, args.role, args.now);
  const reviewCount = reviews.length;
  const ratingAverage = reviewCount > 0 ? round(reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) : null;
  const transactions = completedTransactionsForRole(args.completedTransactions, args.userId, args.role);
  const completedDealCount = transactions.length;
  const uniqueCounterpartyCount = uniqueCounterparties(transactions, args.userId).size;
  const repeatCounterpartyCount = suspiciousRepeatCounterpartyCount(transactions, args.userId);

  const priorMean = 4;
  const priorWeight = 5;
  const observedTotal = reviews.reduce((sum, review) => sum + review.rating, 0);
  const bayesianRating = (observedTotal + priorMean * priorWeight) / (reviewCount + priorWeight);
  const uniquenessRatio = completedDealCount > 0 ? uniqueCounterpartyCount / completedDealCount : 0;
  const dealConfidence = Math.min(1, completedDealCount / 20);
  const ageConfidence = Math.min(1, accountAgeDays(args.userCreatedAt, args.now) / 365);
  const repeatPenalty = repeatCounterpartyCount > 0 ? Math.min(0.4, repeatCounterpartyCount * 0.05) : 0;
  const conservativeScore = round(Math.max(0, bayesianRating * (0.75 + 0.15 * dealConfidence + 0.1 * ageConfidence) * (0.8 + 0.2 * uniquenessRatio) - repeatPenalty));

  return {
    role: args.role,
    ratingAverage,
    reviewCount,
    completedDealCount,
    uniqueCounterpartyCount,
    suspiciousRepeatCounterpartyCount: repeatCounterpartyCount,
    conservativeScore,
    emailVerified: Boolean(args.emailVerifiedAt),
    accountAgeDays: accountAgeDays(args.userCreatedAt, args.now),
    publicContextLabel: PUBLIC_REVIEW_CONTEXT_LABEL,
  };
}

export function buildMarketplaceReputation(args: {
  user: UserLike;
  now: Date;
  reviewsReceived: ReviewWithTransaction[];
  completedTransactions: TransactionLike[];
}) {
  const base = {
    userId: args.user.id,
    emailVerified: Boolean(args.user.emailVerifiedAt),
    memberSince: asDate(args.user.createdAt)?.toISOString() ?? null,
    publicContextLabel: PUBLIC_REVIEW_CONTEXT_LABEL,
  };
  return {
    ...base,
    seller: calculateRoleReputation({
      role: "SELLER",
      userId: args.user.id,
      userCreatedAt: args.user.createdAt,
      emailVerifiedAt: args.user.emailVerifiedAt,
      now: args.now,
      reviewsReceived: args.reviewsReceived,
      completedTransactions: args.completedTransactions,
    }),
    buyer: calculateRoleReputation({
      role: "BUYER",
      userId: args.user.id,
      userCreatedAt: args.user.createdAt,
      emailVerifiedAt: args.user.emailVerifiedAt,
      now: args.now,
      reviewsReceived: args.reviewsReceived,
      completedTransactions: args.completedTransactions,
    }),
  };
}
