/**
 * Unread semantics for enquiry threads (design §7, REQ-NOTIF-3/4/5). This is
 * the single source of truth, shared identically by the enquiry-list endpoint,
 * the unread-count endpoint, and their unit tests.
 *
 * Definitions (matching AC-NOTIF-4.1 and PRD §Assumptions/§UX flows):
 * - "Other party" = the participant that is NOT the viewer (buyer <-> seller).
 * - Inbound activity = max over:
 *     - messages authored by the other party (`senderId === otherParticipantId`),
 *     - the enquiry lifecycle timestamp `updatedAt ?? createdAt`, but ONLY when
 *       the viewer is the SELLER. Rationale: enquiry creation and re-enquiry are
 *       buyer actions, and markSold never touches the enquiry row, so
 *       `updatedAt`/`createdAt` reflect buyer activity only. For the BUYER
 *       viewer, inbound activity is seller messages only.
 * - unread = inboundActivityAt != null AND (lastReadAt == null OR
 *   inboundActivityAt > lastReadAt) — strict `>`.
 * - unreadCount = other-party messages with `createdAt > lastReadAt` (or all
 *   other-party messages when `lastReadAt == null`). Messages only — a fresh
 *   zero-message enquiry yields `unread: true` and `unreadCount: 0`.
 */

export interface EnquiryLike {
  buyerId: string;
  sellerId: string;
  createdAt: Date;
  updatedAt?: Date | null;
}

export interface MsgLike {
  senderId: string;
  createdAt: Date;
}

/** The participant that is NOT the viewer; null when the viewer is not a participant. */
export function otherParticipantId(
  e: { buyerId: string; sellerId: string },
  viewerId: string
): string | null {
  if (viewerId === e.buyerId) return e.sellerId;
  if (viewerId === e.sellerId) return e.buyerId;
  return null;
}

/** Latest inbound-activity timestamp for the viewer, or null when none exists. */
export function inboundActivityAt(
  e: EnquiryLike,
  viewerId: string,
  msgs: MsgLike[]
): Date | null {
  const other = otherParticipantId(e, viewerId);
  const timestamps: number[] = [];
  for (const msg of msgs) {
    if (other !== null && msg.senderId === other) {
      timestamps.push(msg.createdAt.getTime());
    }
  }
  // The enquiry lifecycle reflects buyer activity only, so it is inbound solely
  // for the seller viewer; for the buyer viewer inbound activity = seller msgs.
  if (viewerId === e.sellerId) {
    const lifecycle = e.updatedAt ?? e.createdAt;
    if (lifecycle) timestamps.push(lifecycle.getTime());
  }
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

export function isUnread(
  e: EnquiryLike,
  viewerId: string,
  msgs: MsgLike[],
  lastReadAt: Date | null
): boolean {
  const activityAt = inboundActivityAt(e, viewerId, msgs);
  if (activityAt === null) return false;
  if (lastReadAt === null) return true;
  return activityAt.getTime() > lastReadAt.getTime();
}

export function unreadMessageCount(
  e: EnquiryLike,
  viewerId: string,
  msgs: MsgLike[],
  lastReadAt: Date | null
): number {
  const other = otherParticipantId(e, viewerId);
  if (other === null) return 0;
  return msgs.filter(
    (msg) =>
      msg.senderId === other &&
      (lastReadAt === null || msg.createdAt.getTime() > lastReadAt.getTime())
  ).length;
}
