import { Link } from "react-router-dom";
import type { AppNotification } from "../../types";

interface NotificationToastProps {
  notification: AppNotification | null;
  onOpen: (id: string) => void | Promise<void>;
  onDismiss: () => void;
}

export default function NotificationToast({ notification, onOpen, onDismiss }: NotificationToastProps) {
  if (!notification) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-amber-500/40 bg-gray-900 p-4 shadow-2xl shadow-black/40 md:bottom-6">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">🔔</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{notification.title}</p>
          <p className="mt-1 text-sm text-gray-300">{notification.body}</p>
          <Link
            to={notification.actionUrl}
            onClick={() => void onOpen(notification.id)}
            className="mt-3 inline-flex text-sm font-medium text-amber-300 hover:text-amber-200"
          >
            Open thread →
          </Link>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-white"
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}
