import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "../components/notifications/NotificationBell";
import NotificationToast from "../components/notifications/NotificationToast";
import { useNotifications } from "../hooks/useNotifications";
import type { AppNotification } from "../types";

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "notification_1",
    type: "MARKETPLACE_MESSAGE_CREATED",
    title: "New marketplace message",
    body: "Someone replied to your enquiry thread.",
    actionUrl: "/marketplace/enquiries/enquiry_1",
    relatedType: "MarketplaceEnquiry",
    relatedId: "enquiry_1",
    isRead: false,
    readAt: null,
    createdAt: "2026-09-02T01:00:00.000Z",
    ...overrides,
  };
}

describe("notifications UI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it("renders unread badge, opens the dropdown, and marks a notification read on click", async () => {
    const onMarkAsRead = vi.fn().mockResolvedValue(undefined);
    const onMarkAllAsRead = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <NotificationBell
          notifications={[makeNotification()]}
          unreadCount={1}
          loading={false}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("New marketplace message")).toBeInTheDocument();
    expect(screen.getByText("Someone replied to your enquiry thread.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /New marketplace message/i }));
    expect(onMarkAsRead).toHaveBeenCalledWith("notification_1");
  });

  it("supports empty, loading, capped-count, and read notification states", async () => {
    const onMarkAsRead = vi.fn().mockResolvedValue(undefined);
    const onMarkAllAsRead = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <MemoryRouter>
        <NotificationBell
          notifications={[]}
          unreadCount={0}
          loading={false}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
        />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <NotificationBell
          notifications={[]}
          unreadCount={125}
          loading
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Notifications, 125 unread" })).toBeInTheDocument();
    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.getByText("Loading notifications…")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <NotificationBell
          notifications={[makeNotification({ readAt: "2026-09-02T01:05:00.000Z", isRead: true })]}
          unreadCount={0}
          loading={false}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
        />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("link", { name: /New marketplace message/i }));
    expect(onMarkAsRead).not.toHaveBeenCalledWith("notification_1");
  });

  it("renders toast actions and null state", async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();
    const { container, rerender } = render(
      <MemoryRouter>
        <NotificationToast notification={null} onOpen={onOpen} onDismiss={onDismiss} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <MemoryRouter>
        <NotificationToast notification={makeNotification()} onOpen={onOpen} onDismiss={onDismiss} />
      </MemoryRouter>
    );
    expect(screen.getByText("New marketplace message")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Open thread →" }));
    expect(onOpen).toHaveBeenCalledWith("notification_1");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("loads notifications, raises toast for new unread items, and updates read state", async () => {
    localStorage.setItem("token", "abc");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [makeNotification()], unreadCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [makeNotification({ id: "notification_2" }), makeNotification()], unreadCount: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updated: 1, readAt: "2026-09-02T01:05:00.000Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updated: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    function Harness() {
      const state = useNotifications({ enabled: true, pollIntervalMs: 60_000 });
      return (
        <div>
          <span>Unread: {state.unreadCount}</span>
          <span>Toast: {state.toastNotification?.id ?? "none"}</span>
          <span>First read: {String(state.notifications[0]?.isRead ?? false)}</span>
          <button type="button" onClick={() => void state.reload()}>Reload</button>
          <button type="button" onClick={() => void state.markAsRead("notification_2")}>Read one</button>
          <button type="button" onClick={() => void state.markAllAsRead()}>Read all</button>
        </div>
      );
    }

    render(<Harness />);
    expect(await screen.findByText("Unread: 1")).toBeInTheDocument();
    expect(screen.getByText("Toast: none")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("Unread: 2")).toBeInTheDocument();
    expect(screen.getByText("Toast: notification_2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Read one" }));
    await waitFor(() => expect(screen.getByText("Unread: 1")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/notification_2/read", expect.objectContaining({ method: "POST" }));

    await userEvent.click(screen.getByRole("button", { name: "Read all" }));
    await waitFor(() => expect(screen.getByText("Unread: 0")).toBeInTheDocument());
    expect(screen.getByText("First read: true")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", expect.objectContaining({ method: "POST" }));
  });
});
