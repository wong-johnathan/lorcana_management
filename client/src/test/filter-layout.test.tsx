import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FilterBar from "../components/FilterBar";
import Layout from "../components/Layout";
import { cards } from "../services/api";
import { useAuth } from "../context/AuthContext";

vi.mock("../services/api", () => ({
  cards: { filters: vi.fn() },
  notifications: {
    list: vi.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    unreadCount: vi.fn().mockResolvedValue({ unreadCount: 0 }),
    markRead: vi.fn().mockResolvedValue({ updated: 1, readAt: "2026-09-02T00:00:00.000Z" }),
    markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("FilterBar", () => {
  const options = {
    colors: ["Amber", "Ruby"],
    types: ["Hero", "Princess"],
    sets: ["The First Chapter", "Rise of the Floodborn"],
    rarities: ["Common", "Legendary"],
    cardTypes: ["Character", "Action"],
  };

  beforeEach(() => {
    vi.mocked(cards.filters).mockResolvedValue(options);
  });

  it("loads filter options and emits controlled filter changes", async () => {
    const onChange = vi.fn();
    render(<FilterBar filters={{ search: "Mickey", rarity: "Common", ownership: "owned" }} onChange={onChange} showOwnership />);

    await waitFor(() => expect(screen.getByPlaceholderText("Search by name...")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "Elsa" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Elsa", rarity: "Common", ownership: "owned" }));

    await userEvent.selectOptions(screen.getAllByRole("combobox")[3], "not_owned");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ ownership: "not_owned" }));

    await userEvent.selectOptions(screen.getByDisplayValue("Card Type"), "Character");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cardType: "Character" }));
  });

  it("handles multi-select dropdowns and clear all", async () => {
    const onChange = vi.fn();
    render(<FilterBar filters={{ color: "Amber", type: "Hero", set: "The First Chapter", rarity: "Common" }} onChange={onChange} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Amber" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Amber" }));
    await userEvent.click(screen.getByLabelText("Ruby"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ color: "Amber,Ruby" }));

    await userEvent.click(screen.getByRole("button", { name: "Hero" }));
    await userEvent.click(screen.getByLabelText("Hero"));
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ type: expect.anything() }));

    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });



  it("toggles set, rarity, and type multi-select values", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<FilterBar filters={{}} onChange={onChange} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "All Sets" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "All Sets" }));
    await userEvent.click(screen.getByLabelText("Rise of the Floodborn"));
    expect(onChange).toHaveBeenLastCalledWith({ set: "Rise of the Floodborn" });

    await userEvent.click(screen.getByRole("button", { name: "All Rarities" }));
    await userEvent.click(screen.getByLabelText("Legendary"));
    expect(onChange).toHaveBeenLastCalledWith({ rarity: "Legendary" });

    const rerenderFilters = { set: "Rise of the Floodborn", rarity: "Legendary", color: "Ruby" };
    rerender(<FilterBar filters={rerenderFilters} onChange={onChange} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ruby" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Ruby" }));
    await userEvent.click(screen.getAllByLabelText("Ruby")[0]);
    expect(onChange).toHaveBeenLastCalledWith({ set: "Rise of the Floodborn", rarity: "Legendary" });

    await userEvent.click(screen.getByRole("button", { name: "All Types" }));
    await userEvent.click(screen.getByLabelText("Princess"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: "Princess" }));

    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "yes");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ analyzed: "yes" }));
    await userEvent.selectOptions(screen.getAllByRole("combobox")[2], "price_asc");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "price_asc" }));
  });

  it("renders nothing and logs when filter loading fails", async () => {
    vi.mocked(cards.filters).mockRejectedValueOnce(new Error("offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<FilterBar filters={{}} onChange={vi.fn()} />);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Layout", () => {
  it("renders anonymous navigation and back-to-top behaviour", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, logout: vi.fn() } as any);
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getAllByText("Database")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Master Set")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Sign In")[0]).toBeInTheDocument();

    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    act(() => window.dispatchEvent(new Event("scroll")));
    await userEvent.click(await screen.findByLabelText("Back to top"));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("renders authenticated navigation and logs out", async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u", username: "jw" }, logout } as any);
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getAllByText("Inventory")[0]).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "jw" })[0]).toHaveAttribute("href", "/profile");
    await userEvent.click(screen.getAllByText("Logout")[0]);
    expect(logout).toHaveBeenCalled();
  });
});
