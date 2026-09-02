import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { serializeNotification } from "../services/notifications.js";

const prisma = new PrismaClient() as any;
export const notificationsRouter = Router();

notificationsRouter.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    res.json({ notifications: rows.map(serializeNotification), unreadCount });
  } catch (error) {
    console.error("Notifications list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.get("/unread-count", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
    res.json({ unreadCount });
  } catch (error) {
    console.error("Notifications unread count error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.post("/read-all", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
    res.json({ updated: result.count });
  } catch (error) {
    console.error("Notifications mark all read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

notificationsRouter.post("/:id/read", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params as { id: string };
    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: now },
    });
    res.json({ updated: result.count, readAt: now.toISOString() });
  } catch (error) {
    console.error("Notifications mark read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
