import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  PUBLIC_REVIEW_CONTEXT_LABEL,
  planReviewSubmission,
  serializeReview,
} from "../services/marketplaceReviews.js";
import { buildMarketplaceReputation } from "../services/marketplaceReputation.js";
import { buildReviewReportModerationPlan } from "../services/marketplaceModeration.js";

const prisma = new PrismaClient() as any;
export const marketplaceRouter = Router();

function tagsCreateMany(tags: string[]) {
  return tags.length ? { create: tags.map((tag) => ({ tag })) } : undefined;
}

marketplaceRouter.post("/transactions/:id/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const transactionId = req.params.id as string;
    const actorUserId = req.user!.userId;
    const now = new Date();
    const transaction = await prisma.marketplaceTransaction.findUnique({
      where: { id: transactionId },
      include: { reviews: { include: { tags: true } } },
    });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const reviews = transaction.reviews ?? [];
    const existingReview = reviews.find((review: any) => review.reviewerId === actorUserId) ?? null;
    const counterpartReview = reviews.find((review: any) => review.reviewerId !== actorUserId && review.status === "SEALED") ?? null;
    let plan;
    try {
      plan = planReviewSubmission({
        transaction,
        actorUserId,
        existingReview,
        counterpartReview,
        now,
        input: req.body,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }

    let review;
    if (plan.mode === "update" && existingReview) {
      await prisma.marketplaceReviewTag.deleteMany({ where: { reviewId: existingReview.id } });
      review = await prisma.marketplaceReview.update({
        where: { id: existingReview.id },
        data: {
          rating: plan.reviewData.rating,
          comment: plan.reviewData.comment,
          status: plan.reviewData.status,
          moderationStatus: plan.reviewData.moderationStatus,
          submittedAt: plan.reviewData.submittedAt,
          revealedAt: plan.reviewData.revealedAt,
          tags: tagsCreateMany(plan.tags),
        },
        include: { tags: true },
      });
    } else {
      review = await prisma.marketplaceReview.create({
        data: {
          transactionId: plan.reviewData.transactionId,
          reviewerId: plan.reviewData.reviewerId,
          revieweeId: plan.reviewData.revieweeId,
          reviewerRole: plan.reviewData.reviewerRole,
          rating: plan.reviewData.rating,
          comment: plan.reviewData.comment,
          status: plan.reviewData.status,
          moderationStatus: plan.reviewData.moderationStatus,
          submittedAt: plan.reviewData.submittedAt,
          revealedAt: plan.reviewData.revealedAt,
          tags: tagsCreateMany(plan.tags),
        },
        include: { tags: true },
      });
    }

    if (plan.revealReviewIds.length > 0) {
      await prisma.marketplaceReview.updateMany({
        where: { id: { in: plan.revealReviewIds } },
        data: { status: "REVEALED", revealedAt: now },
      });
    }

    res.status(plan.mode === "create" ? 201 : 200).json({
      review: serializeReview(review),
      publicContextLabel: PUBLIC_REVIEW_CONTEXT_LABEL,
    });
  } catch (error) {
    console.error("Marketplace review submit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.get("/users/:userId/reputation", async (req, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true, emailVerifiedAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [reviewsReceived, completedTransactions] = await Promise.all([
      prisma.marketplaceReview.findMany({
        where: { revieweeId: userId },
        include: { tags: true, transaction: true },
      }),
      prisma.marketplaceTransaction.findMany({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }], status: "COMPLETED" },
      }),
    ]);
    res.json(buildMarketplaceReputation({ user, reviewsReceived, completedTransactions, now: new Date() }));
  } catch (error) {
    console.error("Marketplace reputation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/reviews/:id/report", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const reviewId = req.params.id as string;
    const reporterId = req.user!.userId;
    const review = await prisma.marketplaceReview.findUnique({ where: { id: reviewId } });
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }
    let plan;
    try {
      plan = buildReviewReportModerationPlan({ reporterId, reviewId, input: req.body });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    const report = await prisma.marketplaceReport.create({ data: plan.reportData });
    await prisma.marketplaceReview.update({
      where: { id: reviewId },
      data: { moderationStatus: plan.reviewModerationStatus },
    });
    res.status(201).json({ report: { id: report.id, status: report.status } });
  } catch (error) {
    console.error("Marketplace report error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
