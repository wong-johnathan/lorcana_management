import { describe, expect, it } from "vitest";
import {
  inboundActivityAt,
  isUnread,
  otherParticipantId,
  unreadMessageCount,
  type EnquiryLike,
  type MsgLike,
} from "../src/services/marketplaceUnread.js";

const buyerId = "buyer1";
const sellerId = "seller1";
const createdAt = new Date("2026-10-01T00:00:00Z");
const updatedAt = new Date("2026-10-02T00:00:00Z");

function enquiry(overrides: Partial<EnquiryLike> = {}): EnquiryLike {
  return { buyerId, sellerId, createdAt, updatedAt, ...overrides };
}

function msg(senderId: string, createdAt: Date): MsgLike {
  return { senderId, createdAt };
}

describe("marketplaceUnread.otherParticipantId", () => {
  it("returns the seller for a buyer viewer and the buyer for a seller viewer", () => {
    expect(otherParticipantId(enquiry(), buyerId)).toBe(sellerId);
    expect(otherParticipantId(enquiry(), sellerId)).toBe(buyerId);
  });

  it("returns null for a non-participant viewer", () => {
    expect(otherParticipantId(enquiry(), "stranger")).toBeNull();
  });
});

describe("marketplaceUnread.inboundActivityAt", () => {
  it("treats the enquiry lifecycle as inbound for the seller even with zero messages (AC-NOTIF-4.2)", () => {
    expect(inboundActivityAt(enquiry(), sellerId, [])).toEqual(updatedAt);
  });

  it("falls back to createdAt for the seller when updatedAt is absent", () => {
    expect(inboundActivityAt(enquiry({ updatedAt: undefined }), sellerId, [])).toEqual(createdAt);
  });

  it("excludes the enquiry lifecycle for the buyer viewer (own enquiry never unread)", () => {
    expect(inboundActivityAt(enquiry(), buyerId, [])).toBeNull();
  });

  it("uses the other party's messages for the buyer viewer", () => {
    const sellerMsg = msg(sellerId, new Date("2026-10-03T00:00:00Z"));
    expect(inboundActivityAt(enquiry(), buyerId, [sellerMsg])).toEqual(sellerMsg.createdAt);
  });

  it("takes the max of other-party messages and the lifecycle for the seller", () => {
    const early = msg(buyerId, new Date("2026-10-01T12:00:00Z"));
    const late = msg(buyerId, new Date("2026-10-05T00:00:00Z"));
    expect(inboundActivityAt(enquiry(), sellerId, [early, late])).toEqual(late.createdAt);
    // Lifecycle (10-02) is newer than the early message but older than the late one.
    expect(inboundActivityAt(enquiry(), sellerId, [early])).toEqual(updatedAt);
  });

  it("ignores the viewer's own messages entirely", () => {
    const ownMsg = msg(buyerId, new Date("2026-10-09T00:00:00Z"));
    // Buyer viewer: their own message is not inbound, and no seller messages exist.
    expect(inboundActivityAt(enquiry(), buyerId, [ownMsg])).toBeNull();
  });

  it("returns null for a non-participant viewer", () => {
    expect(inboundActivityAt(enquiry(), "stranger", [msg(buyerId, createdAt)])).toBeNull();
  });
});

describe("marketplaceUnread.isUnread", () => {
  it("is unread when never read and inbound activity exists", () => {
    expect(isUnread(enquiry(), sellerId, [], null)).toBe(true);
  });

  it("is not unread when there is no inbound activity even if never read (AC-NOTIF-3.4)", () => {
    expect(isUnread(enquiry(), buyerId, [], null)).toBe(false);
  });

  it("is not unread when lastReadAt is after the inbound activity", () => {
    const after = new Date("2026-10-03T00:00:00Z");
    expect(isUnread(enquiry(), sellerId, [], after)).toBe(false);
  });

  it("uses a strict > boundary: lastReadAt equal to inbound activity is read", () => {
    // Seller lifecycle is `updatedAt` (10-02); a read state at exactly the same
    // instant must NOT count as unread.
    expect(isUnread(enquiry(), sellerId, [], updatedAt)).toBe(false);
  });

  it("is unread when lastReadAt is strictly before the inbound activity", () => {
    const before = new Date("2026-10-01T12:00:00Z");
    expect(isUnread(enquiry(), sellerId, [], before)).toBe(true);
  });
});

describe("marketplaceUnread.unreadMessageCount", () => {
  it("is 0 for a fresh zero-message enquiry (AC-NOTIF-4.2)", () => {
    expect(unreadMessageCount(enquiry(), sellerId, [], null)).toBe(0);
  });

  it("counts other-party messages after lastReadAt", () => {
    const msgs = [
      msg(sellerId, new Date("2026-10-03T00:00:00Z")),
      msg(sellerId, new Date("2026-10-04T00:00:00Z")),
    ];
    const lastReadAt = new Date("2026-10-03T12:00:00Z");
    expect(unreadMessageCount(enquiry(), buyerId, msgs, lastReadAt)).toBe(1);
  });

  it("counts all other-party messages when never read", () => {
    const msgs = [msg(sellerId, createdAt), msg(sellerId, updatedAt)];
    expect(unreadMessageCount(enquiry(), buyerId, msgs, null)).toBe(2);
  });

  it("never counts the viewer's own messages (own-message-never-unread rule)", () => {
    const msgs = [msg(buyerId, createdAt), msg(buyerId, updatedAt)];
    expect(unreadMessageCount(enquiry(), buyerId, msgs, null)).toBe(0);
  });

  it("uses a strict > boundary on the message timestamp", () => {
    const at = new Date("2026-10-03T00:00:00Z");
    // A message authored at exactly lastReadAt is not counted.
    expect(unreadMessageCount(enquiry(), buyerId, [msg(sellerId, at)], at)).toBe(0);
  });

  it("returns 0 for a non-participant viewer", () => {
    expect(unreadMessageCount(enquiry(), "stranger", [msg(sellerId, createdAt)], null)).toBe(0);
  });
});
