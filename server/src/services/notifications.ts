export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  relatedType?: string | null;
  relatedId?: string | null;
  readAt?: Date | string | null;
  createdAt: Date | string;
}

interface NotificationCopy {
  title: string;
  body: string;
}

const NOTIFICATION_COPY: Record<string, NotificationCopy> = {
  MARKETPLACE_ENQUIRY_CREATED: {
    title: "New marketplace enquiry",
    body: "Someone started an enquiry on one of your listings.",
  },
  MARKETPLACE_MESSAGE_CREATED: {
    title: "New marketplace message",
    body: "Someone replied to your enquiry thread.",
  },
  MARKETPLACE_OFFER_CREATED: {
    title: "New marketplace offer",
    body: "Someone sent an offer or counteroffer.",
  },
  MARKETPLACE_RESERVATION_CREATED: {
    title: "Marketplace reservation created",
    body: "A deal was accepted and stock has been reserved.",
  },
  MARKETPLACE_RESERVATION_CANCELLED: {
    title: "Marketplace reservation cancelled",
    body: "A marketplace reservation was cancelled.",
  },
  MARKETPLACE_ENQUIRY_DECLINED: {
    title: "Marketplace enquiry declined",
    body: "The seller declined this enquiry.",
  },
  MARKETPLACE_ENQUIRY_WITHDRAWN: {
    title: "Marketplace enquiry withdrawn",
    body: "The buyer withdrew this enquiry.",
  },
};

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function actionUrlForNotification(notification: NotificationRecord) {
  if (notification.relatedType === "MarketplaceEnquiry" && notification.relatedId) {
    return `/marketplace/enquiries/${notification.relatedId}`;
  }
  return "/marketplace/enquiries";
}

export function serializeNotification(notification: NotificationRecord) {
  const copy = NOTIFICATION_COPY[notification.type] ?? {
    title: "Notification",
    body: "You have a new update.",
  };

  return {
    id: notification.id,
    type: notification.type,
    title: copy.title,
    body: copy.body,
    actionUrl: actionUrlForNotification(notification),
    relatedType: notification.relatedType ?? null,
    relatedId: notification.relatedId ?? null,
    isRead: Boolean(notification.readAt),
    readAt: iso(notification.readAt),
    createdAt: iso(notification.createdAt),
  };
}
