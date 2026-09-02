import { useState } from "react";
import { Link } from "react-router-dom";
import type { AppNotification } from "../../types";
import { formatTimeAgo } from "../../utils/format";

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  onMarkAsRead: (id: string) => void | Promise<void>;
  onMarkAllAsRead: () => void | Promise<void>;
}

export default function NotificationBell({
  notifications,
  unreadCount,
  loading,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-gray-300 transition-colors hover:border-amber-500/60 hover:text-amber-300"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022 23.848 23.848 0 005.455 1.31m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 text-center text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-2xl shadow-black/40">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Notifications</h2>
            <button
              type="button"
              onClick={() => void onMarkAllAsRead()}
              className="text-xs text-amber-300 hover:text-amber-200"
            >
              Mark all as read
            </button>
          </div>

          {loading && notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No notifications yet</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  to={notification.actionUrl}
                  onClick={() => {
                    setOpen(false);
                    if (!notification.isRead) void onMarkAsRead(notification.id);
                  }}
                  className={`block rounded-lg border p-3 transition-colors ${
                    notification.isRead
                      ? "border-gray-800 bg-gray-950/50 hover:border-gray-700"
                      : "border-amber-500/30 bg-amber-500/10 hover:border-amber-400/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{notification.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-300">{notification.body}</p>
                    </div>
                    {!notification.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" aria-hidden="true" />}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{formatTimeAgo(notification.createdAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
