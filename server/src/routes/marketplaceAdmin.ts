import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateOperator, AuthRequest } from "../middleware/auth.js";
import {
  disableUser,
  MarketplaceError,
} from "../services/marketplaceTransitions.js";
import { isValidReportTargetType, REPORT_STATUSES } from "../services/marketplace.js";

const prisma = new PrismaClient();
export const marketplaceAdminRouter = Router();

/**
 * Operator-only endpoints (design §7). Mounted at `/api/marketplace/admin`
 * (BEFORE the main marketplace router in app.ts) so these paths resolve before
 * B3's dynamic `:id` routes. Every handler is gated by `authenticateOperator`
 * (valid token + `isOperator === true`, 403 otherwise).
 */
function sendError(res: Response, error: unknown): void {
  if (error instanceof MarketplaceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error("Marketplace admin route error:", error);
  res.status(500).json({ error: "Internal server error" });
}

marketplaceAdminRouter.use(authenticateOperator);

// AC-22.2: list reports, filterable by status and target type.
marketplaceAdminRouter.get("/reports", async (req: AuthRequest, res: Response) => {
  try {
    const query = (req.query ?? {}) as Record<string, unknown>;
    const where: Record<string, unknown> = {};

    const status = typeof query.status === "string" ? query.status : undefined;
    if (status) {
      if (!(REPORT_STATUSES as readonly string[]).includes(status)) {
        throw new MarketplaceError(400, "Invalid report status");
      }
      where.status = status;
    }

    const targetType =
      typeof query.targetType === "string" ? query.targetType : undefined;
    if (targetType) {
      if (!isValidReportTargetType(targetType)) {
        throw new MarketplaceError(400, "Invalid target type");
      }
      where.targetType = targetType;
    }

    const reports = await prisma.marketplaceReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { reporter: { select: { id: true, username: true } } },
    });
    res.json({ reports });
  } catch (error) {
    sendError(res, error);
  }
});

// AC-22.2: take a listing down (set hiddenAt = now) and resolve its linked
// reports atomically. Idempotent: already-resolved reports are left alone.
marketplaceAdminRouter.post(
  "/listings/:id/takedown",
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await prisma.$transaction(async (tx) => {
        const listing = await tx.marketplaceListing.findUnique({ where: { id } });
        if (!listing) throw new MarketplaceError(404, "Listing not found");

        await tx.marketplaceListing.update({
          where: { id },
          data: { hiddenAt: new Date() },
        });

        const resolved = await tx.marketplaceReport.updateMany({
          where: { targetType: "LISTING", targetId: id, status: "OPEN" },
          data: { status: "RESOLVED" },
        });

        return { id, hiddenAt: true, resolvedReports: resolved.count };
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

// REQ-24: disable a user and auto-cancel their pending transactions with
// actor SYSTEM (B2 disableUser). Disabling is idempotent.
marketplaceAdminRouter.post(
  "/users/:id/disable",
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) throw new MarketplaceError(404, "User not found");

      const result = await disableUser(id);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);
