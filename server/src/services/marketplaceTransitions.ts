export type MarketplaceActorRole = "BUYER" | "SELLER" | "SYSTEM";

export type MarketplaceEnquiryStatus =
  | "PENDING_SELLER"
  | "AWAITING_BUYER"
  | "RESERVED"
  | "DECLINED"
  | "WITHDRAWN";

export type MarketplaceReservationStatus =
  | "RESERVED"
  | "AWAITING_BUYER_CONFIRMATION"
  | "CANCELLED"
  | "EXPIRED"
  | "COMPLETED"
  | "DISPUTED";

export type EnquiryAction =
  | "SELLER_ACCEPT"
  | "SELLER_COUNTER"
  | "SELLER_DECLINE"
  | "BUYER_ACCEPT"
  | "BUYER_COUNTER"
  | "BUYER_OFFER"
  | "BUYER_WITHDRAW";

export type ReservationAction =
  | "SELLER_MARK_SOLD"
  | "BUYER_CONFIRM"
  | "BUYER_DISPUTE"
  | "CANCEL"
  | "EXPIRE";

export class MarketplaceTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceTransitionError";
  }
}

function requireActor(action: string, actorRole: MarketplaceActorRole, expected: MarketplaceActorRole) {
  if (actorRole !== expected) {
    const label = expected.toLowerCase();
    throw new MarketplaceTransitionError(`${label} action requires ${label} actor: ${action}`);
  }
}

export function assertEnquiryTransition(input: {
  currentStatus: MarketplaceEnquiryStatus;
  action: EnquiryAction;
  actorRole: MarketplaceActorRole;
}): MarketplaceEnquiryStatus {
  const { currentStatus, action, actorRole } = input;

  if (action.startsWith("SELLER_")) requireActor(action, actorRole, "SELLER");
  if (action.startsWith("BUYER_")) requireActor(action, actorRole, "BUYER");

  if (currentStatus === "PENDING_SELLER") {
    if (action === "SELLER_ACCEPT") return "RESERVED";
    if (action === "SELLER_COUNTER") return "AWAITING_BUYER";
    if (action === "SELLER_DECLINE") return "DECLINED";
    if (action === "BUYER_WITHDRAW") return "WITHDRAWN";
    if (action === "BUYER_OFFER") return "PENDING_SELLER";
  }

  if (currentStatus === "AWAITING_BUYER") {
    if (action === "BUYER_ACCEPT") return "RESERVED";
    if (action === "BUYER_COUNTER") return "PENDING_SELLER";
    if (action === "BUYER_WITHDRAW") return "WITHDRAWN";
  }

  throw new MarketplaceTransitionError(`Cannot apply ${action} from ${currentStatus}`);
}

export function assertReservationTransition(input: {
  currentStatus: MarketplaceReservationStatus;
  action: ReservationAction;
  actorRole: MarketplaceActorRole;
}): MarketplaceReservationStatus {
  const { currentStatus, action, actorRole } = input;

  if (action === "SELLER_MARK_SOLD") requireActor(action, actorRole, "SELLER");
  if (action === "BUYER_CONFIRM" || action === "BUYER_DISPUTE") requireActor(action, actorRole, "BUYER");
  if (action === "EXPIRE") requireActor(action, actorRole, "SYSTEM");

  if (currentStatus === "RESERVED") {
    if (action === "SELLER_MARK_SOLD") return "AWAITING_BUYER_CONFIRMATION";
    if (action === "CANCEL") return "CANCELLED";
    if (action === "EXPIRE") return "EXPIRED";
  }

  if (currentStatus === "AWAITING_BUYER_CONFIRMATION") {
    if (action === "BUYER_CONFIRM") return "COMPLETED";
    if (action === "BUYER_DISPUTE") return "DISPUTED";
  }

  throw new MarketplaceTransitionError(`Cannot apply ${action} from ${currentStatus}`);
}
