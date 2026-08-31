import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import WebSocket from "ws";
import { signToken } from "../src/middleware/auth.js";
import { attachMarketplaceRealtime, broadcastMarketplaceEvent, setMarketplaceRealtimeBroadcaster } from "../src/services/marketplaceRealtime.js";
import { prismaMock } from "./prismaMock";

function listen(server: Server) {
  return new Promise<number>((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

function nextMessage(socket: WebSocket) {
  return new Promise<any>((resolve) => {
    socket.once("message", (raw) => resolve(JSON.parse(raw.toString())));
  });
}

function waitClose(socket: WebSocket) {
  return new Promise<{ code: number; reason: string }>((resolve) => {
    socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

describe("marketplace realtime websocket", () => {
  let server: Server | null = null;

  afterEach(async () => {
    setMarketplaceRealtimeBroadcaster(null);
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  });

  it("broadcasts via the test broadcaster hook", () => {
    const events: unknown[] = [];
    setMarketplaceRealtimeBroadcaster((event) => events.push(event));

    broadcastMarketplaceEvent({ type: "message.created", enquiryId: "enquiry_1", payload: { id: "message_1" } });

    expect(events).toEqual([{ type: "message.created", enquiryId: "enquiry_1", payload: { id: "message_1" } }]);
  });

  it("authenticates websocket clients, authorizes enquiry subscriptions, and sends events", async () => {
    server = createServer();
    attachMarketplaceRealtime(server);
    const port = await listen(server);
    const token = signToken({ userId: "buyer_1", username: "buyer" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/marketplace/ws?token=${encodeURIComponent(token)}`);

    await expect(nextMessage(socket)).resolves.toEqual({ type: "connected" });
    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce({ buyerId: "buyer_1", listing: { userId: "seller_1" } });
    socket.send(JSON.stringify({ type: "subscribe", enquiryId: "enquiry_1" }));
    await expect(nextMessage(socket)).resolves.toEqual({ type: "subscribed", enquiryId: "enquiry_1" });

    broadcastMarketplaceEvent({ type: "offer.created", enquiryId: "enquiry_1", payload: { id: "offer_1" } });
    await expect(nextMessage(socket)).resolves.toEqual({ type: "offer.created", enquiryId: "enquiry_1", payload: { id: "offer_1" } });
    socket.close();
  });

  it("rejects invalid tokens and unsupported or unauthorized subscription messages", async () => {
    server = createServer();
    attachMarketplaceRealtime(server);
    const port = await listen(server);

    const invalid = new WebSocket(`ws://127.0.0.1:${port}/api/marketplace/ws?token=bad`);
    await expect(waitClose(invalid)).resolves.toEqual({ code: 1008, reason: "Authentication required" });

    const token = signToken({ userId: "buyer_1", username: "buyer" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/marketplace/ws?token=${encodeURIComponent(token)}`);
    await nextMessage(socket);

    socket.send("not-json");
    await expect(nextMessage(socket)).resolves.toEqual({ type: "error", error: "Invalid JSON" });

    socket.send(JSON.stringify({ type: "ping" }));
    await expect(nextMessage(socket)).resolves.toEqual({ type: "error", error: "Unsupported websocket message" });

    prismaMock.marketplaceEnquiry.findUnique.mockResolvedValueOnce({ buyerId: "other", listing: { userId: "seller_1" } });
    socket.send(JSON.stringify({ type: "subscribe", enquiryId: "enquiry_2" }));
    await expect(nextMessage(socket)).resolves.toEqual({ type: "error", error: "Not allowed to access this enquiry" });
    socket.close();
  });
});
