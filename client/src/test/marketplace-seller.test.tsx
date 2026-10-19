import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import ReferenceForm from "../components/marketplace/ReferenceForm";
import MarketplaceSellerPage from "../pages/marketplace/MarketplaceSellerPage";

const { sellerMock, vouchMock, reportMock } = vi.hoisted(() => ({
  sellerMock: vi.fn(),
  vouchMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: { seller: sellerMock, vouch: vouchMock, report: reportMock },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const references = [
  {
    id: "ref_1",
    authorId: "author_1",
    author: { id: "author_1", username: "bob" },
    subjectId: "seller_1",
    comment: "Great trader, fast shipping",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    hasCompletedDeal: true,
  },
  {
    id: "ref_2",
    authorId: "author_2",
    author: { id: "author_2", username: "carol" },
    subjectId: "seller_1",
    comment: "Friendly seller",
    createdAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
    hasCompletedDeal: false,
  },
];

const sellerProfile = {
  user: { id: "seller_1", username: "alice", profile: {} },
  listings: [],
  reviews: [],
  references,
};

function renderSellerPage() {
  return render(
    <MemoryRouter initialEntries={["/marketplace/seller/seller_1"]}>
      <Routes>
        <Route path="/marketplace/seller/:userId" element={<MarketplaceSellerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MarketplaceSellerPage", () => {
  beforeEach(() => {
    sellerMock.mockReset();
    vouchMock.mockReset();
    reportMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
  });

  it("shows a completed-deal badge only on references that have one", async () => {
    sellerMock.mockResolvedValue(sellerProfile);
    renderSellerPage();

    expect(await screen.findByText("Great trader, fast shipping")).toBeInTheDocument();
    expect(screen.getByText("Completed deal")).toBeInTheDocument();
    expect(screen.getByText("Friendly seller")).toBeInTheDocument();
    expect(screen.getAllByText("Completed deal")).toHaveLength(1);
  });

  it("renders a vouch form for authed visitors", async () => {
    sellerMock.mockResolvedValue({ ...sellerProfile, references: [] });
    renderSellerPage();

    expect(await screen.findByRole("heading", { name: "Leave a reference" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your reference")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave reference" })).toBeDisabled();
  });
});

describe("ReferenceForm", () => {
  beforeEach(() => {
    vouchMock.mockReset();
  });

  it("prompts anonymous visitors to sign in", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    render(
      <MemoryRouter>
        <ReferenceForm subjectId="seller_1" />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Your reference")).not.toBeInTheDocument();
  });

  it("submits a vouch for authed visitors", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
    vouchMock.mockResolvedValue({ id: "ref_new", hasCompletedDeal: false });
    render(
      <MemoryRouter>
        <ReferenceForm subjectId="seller_1" />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText("Your reference"), "Trustworthy trader");
    await userEvent.click(screen.getByRole("button", { name: "Leave reference" }));

    await waitFor(() => expect(vouchMock).toHaveBeenCalledWith("seller_1", "Trustworthy trader"));
    expect(await screen.findByText("Reference saved.")).toBeInTheDocument();
  });

  it("surfaces a vouch submission error", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
    vouchMock.mockRejectedValue(new Error("Cannot vouch for yourself"));
    render(
      <MemoryRouter>
        <ReferenceForm subjectId="seller_1" />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText("Your reference"), "self-vouch");
    await userEvent.click(screen.getByRole("button", { name: "Leave reference" }));

    expect(await screen.findByText("Cannot vouch for yourself")).toBeInTheDocument();
  });

  it("invokes the onSubmitted callback with the created reference", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
    const reference = { id: "ref_new", hasCompletedDeal: true };
    vouchMock.mockResolvedValue(reference);
    const onSubmitted = vi.fn();
    render(
      <MemoryRouter>
        <ReferenceForm subjectId="seller_1" onSubmitted={onSubmitted} />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText("Your reference"), "Great");
    await userEvent.click(screen.getByRole("button", { name: "Leave reference" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(reference));
  });
});
