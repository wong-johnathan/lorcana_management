import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";

const { getUnreadCountMock } = vi.hoisted(() => ({
  getUnreadCountMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    getUnreadCount: getUnreadCountMock,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const loggedInUser = { id: "user_1", username: "alice" };

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Layout />
    </MemoryRouter>
  );
}

/** Harness that exposes a navigate button so tests can drive a route change. */
function RouteHarness() {
  const navigate = useNavigate();
  return (
    <>
      <Layout />
      <button type="button" onClick={() => navigate("/inventory")}>
        go-inventory
      </button>
    </>
  );
}

describe("Layout — Messages nav item + unread badge (REQ-NOTIF-1, REQ-NOTIF-7)", () => {
  beforeEach(() => {
    getUnreadCountMock.mockReset();
  });

  it("renders Messages for logged-in users and fetches the unread count (AC-NOTIF-1.1/1.4)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: loggedInUser, logout: vi.fn() } as never);
    getUnreadCountMock.mockResolvedValue({ count: 0 });

    renderLayout();

    expect(await screen.findAllByRole("link", { name: "Messages" })).toHaveLength(2);
    await waitFor(() => expect(getUnreadCountMock).toHaveBeenCalledTimes(1));
  });

  it("does not render Messages for anonymous users and never fetches (AC-NOTIF-1.1)", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, logout: vi.fn() } as never);

    renderLayout();

    expect(screen.queryByRole("link", { name: /Messages/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
    expect(getUnreadCountMock).not.toHaveBeenCalled();
  });

  it("shows a count badge with an accessible label when unread > 0 (AC-NOTIF-1.2/1.5)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: loggedInUser, logout: vi.fn() } as never);
    getUnreadCountMock.mockResolvedValue({ count: 3 });

    renderLayout();

    expect(await screen.findAllByRole("link", { name: "Messages, 3 unread" })).toHaveLength(2);
    const badges = screen.getAllByTestId("messages-unread-badge");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent("3");
  });

  it("hides the badge at zero (AC-NOTIF-1.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: loggedInUser, logout: vi.fn() } as never);
    getUnreadCountMock.mockResolvedValue({ count: 0 });

    renderLayout();

    expect(await screen.findAllByRole("link", { name: "Messages" })).toHaveLength(2);
    expect(screen.queryAllByTestId("messages-unread-badge")).toHaveLength(0);
  });

  it("fails open to no badge when the unread fetch errors", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: loggedInUser, logout: vi.fn() } as never);
    getUnreadCountMock.mockRejectedValue(new Error("network down"));

    renderLayout();

    await waitFor(() => expect(getUnreadCountMock).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByRole("link", { name: "Messages" })).toHaveLength(2);
    expect(screen.queryAllByTestId("messages-unread-badge")).toHaveLength(0);
  });

  it("refetches the count on route change (AC-NOTIF-7.3)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: loggedInUser, logout: vi.fn() } as never);
    getUnreadCountMock.mockResolvedValueOnce({ count: 3 });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RouteHarness />
      </MemoryRouter>
    );

    expect((await screen.findAllByTestId("messages-unread-badge"))[0]).toHaveTextContent("3");

    getUnreadCountMock.mockResolvedValueOnce({ count: 5 });
    await userEvent.click(screen.getByRole("button", { name: "go-inventory" }));

    await waitFor(() => expect(getUnreadCountMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getAllByTestId("messages-unread-badge")[0]).toHaveTextContent("5")
    );
  });

  it("refetches immediately on the unread:refresh window event (AC-NOTIF-7.1/7.2)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: loggedInUser, logout: vi.fn() } as never);
    getUnreadCountMock.mockResolvedValueOnce({ count: 2 });

    renderLayout();

    expect((await screen.findAllByTestId("messages-unread-badge"))[0]).toHaveTextContent("2");

    getUnreadCountMock.mockResolvedValueOnce({ count: 7 });
    act(() => {
      window.dispatchEvent(new CustomEvent("unread:refresh"));
    });

    await waitFor(() => expect(getUnreadCountMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getAllByTestId("messages-unread-badge")[0]).toHaveTextContent("7")
    );
  });
});
