import { useCallback, useEffect, useRef, useState } from "react";
import { notifications as notificationsApi } from "../services/api";
import type { AppNotification } from "../types";

interface UseNotificationsOptions {
  enabled: boolean;
  pollIntervalMs?: number;
}

export function useNotifications({ enabled, pollIntervalMs = 30_000 }: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toastNotification, setToastNotification] = useState<AppNotification | null>(null);
  const hasLoadedOnce = useRef(false);
  const knownUnreadIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const response = await notificationsApi.list();
      const unreadIds = new Set(response.notifications.filter((item) => !item.isRead).map((item) => item.id));
      if (hasLoadedOnce.current) {
        const freshUnread = response.notifications.find((item) => !item.isRead && !knownUnreadIds.current.has(item.id));
        if (freshUnread) setToastNotification(freshUnread);
      }
      knownUnreadIds.current = unreadIds;
      hasLoadedOnce.current = true;
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error("Failed to load notifications", error);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setNotifications([]);
      setUnreadCount(0);
      setToastNotification(null);
      hasLoadedOnce.current = false;
      knownUnreadIds.current = new Set();
      return;
    }

    void load();
    const interval = window.setInterval(() => void load(), pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [enabled, load, pollIntervalMs]);

  const markAsRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    knownUnreadIds.current.delete(id);
    setNotifications((current) => current.map((item) => (
      item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item
    )));
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    knownUnreadIds.current = new Set();
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    toastNotification,
    reload: load,
    markAsRead,
    markAllAsRead,
    clearToast: () => setToastNotification(null),
  };
}
