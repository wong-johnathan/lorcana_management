import type { Server as HttpServer, IncomingMessage } from "http";
import { PrismaClient } from "@prisma/client";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { verifyAuthToken } from "../middleware/auth.js";

const prisma = new PrismaClient() as any;

type MarketplaceRealtimeEvent = {
  type: "message.created" | "offer.created" | "enquiry.status_changed" | "reservation.created" | "reservation.cancelled" | "reservation.expired";
  enquiryId: string;
  payload?: unknown;
};

type Client = WebSocket & { userId?: string; enquiryIds?: Set<string> };

let sockets = new Set<Client>();
let customBroadcaster: ((event: MarketplaceRealtimeEvent) => void) | null = null;

async function canAccessEnquiry(userId: string, enquiryId: string) {
  const enquiry = await prisma.marketplaceEnquiry.findUnique({
    where: { id: enquiryId },
    select: { buyerId: true, listing: { select: { userId: true } } },
  });
  return Boolean(enquiry && (enquiry.buyerId === userId || enquiry.listing?.userId === userId));
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

export function setMarketplaceRealtimeBroadcaster(broadcaster: ((event: MarketplaceRealtimeEvent) => void) | null) {
  customBroadcaster = broadcaster;
}

export function broadcastMarketplaceEvent(event: MarketplaceRealtimeEvent) {
  if (customBroadcaster) {
    customBroadcaster(event);
    return;
  }
  for (const socket of sockets) {
    if (socket.enquiryIds?.has(event.enquiryId)) sendJson(socket, event);
  }
}

export function attachMarketplaceRealtime(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/api/marketplace/ws" });
  sockets = new Set<Client>();

  wss.on("connection", (socket: Client, request: IncomingMessage) => {
    const url = new URL(request.url ?? "/api/marketplace/ws", "http://localhost");
    const token = url.searchParams.get("token");
    const payload = token ? verifyAuthToken(token) : null;
    if (!payload) {
      socket.close(1008, "Authentication required");
      return;
    }

    socket.userId = payload.userId;
    socket.enquiryIds = new Set();
    sockets.add(socket);
    sendJson(socket, { type: "connected" });

    socket.on("message", async (raw: RawData) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendJson(socket, { type: "error", error: "Invalid JSON" });
        return;
      }
      if (message?.type !== "subscribe" || typeof message.enquiryId !== "string") {
        sendJson(socket, { type: "error", error: "Unsupported websocket message" });
        return;
      }
      if (!socket.userId || !(await canAccessEnquiry(socket.userId, message.enquiryId))) {
        sendJson(socket, { type: "error", error: "Not allowed to access this enquiry" });
        return;
      }
      socket.enquiryIds?.add(message.enquiryId);
      sendJson(socket, { type: "subscribed", enquiryId: message.enquiryId });
    });

    socket.on("close", () => sockets.delete(socket));
  });

  return wss;
}
