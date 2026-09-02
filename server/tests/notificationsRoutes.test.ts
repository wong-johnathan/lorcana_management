import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const app = createApp();
const token = signToken({ userId: "user_1", username: "jw" });

function auth(req: request.Test) {
  return req.set("Authorization", `Bearer ${token}`);
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification_1",
    userId: "user_1",
    type: "MARKETPLACE_MESSAGE_CREATED",
    relatedType: "MarketplaceEnquiry",
    relatedId: "enquiry_1",
    readAt: null,
    createdAt: new Date("2026-09-02T01:00:00.000Z"),
    ...overrides,
  };
}

describe("notification routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lists current-user notifications with unread count and display copy", async () => {
    prismaMock.notification.findMany.mockResolvedValueOnce([
      notification(),
      notification({ id: "notification_2", type: "MARKETPLACE_ENQUIRY_CREATED", relatedId: "enquiry_2", readAt: new Date("2026-09-02T01:05:00.000Z") }),
    ]);
    prismaMock.notification.count.mockResolvedValueOnce(1);

    await auth(request(app).get("/api/notifications"))
      .expect(200)
      .expect((res) => {
        expect(res.body.unreadCount).toBe(1);
        expect(res.body.notifications[0]).toEqual(expect.objectContaining({
          id: "notification_1",
          type: "MARKETPLACE_MESSAGE_CREATED",
          title: "New marketplace message",
          body: "Someone replied to your enquiry thread.",
          actionUrl: "/marketplace/enquiries/enquiry_1",
          isRead: false,
          createdAt: "2026-09-02T01:00:00.000Z",
        }));
      });

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }));
    expect(prismaMock.notification.count).toHaveBeenCalledWith({ where: { userId: "user_1", readAt: null } });
  });

  it("marks one notification read only when it belongs to the current user", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 1 });

    await auth(request(app).post("/api/notifications/notification_1/read"))
      .expect(200)
      .expect((res) => expect(res.body.readAt).toEqual(expect.any(String)));

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notification_1", userId: "user_1", readAt: null },
      data: { readAt: expect.any(Date) },
    }));
  });

  it("marks all current-user notifications as read", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 3 });

    await auth(request(app).post("/api/notifications/read-all"))
      .expect(200, { updated: 3 });

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1", readAt: null },
      data: { readAt: expect.any(Date) },
    }));
  });
});
