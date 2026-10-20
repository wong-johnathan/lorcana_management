import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BulkListingSkipList from "../components/marketplace/BulkListingSkipList";
import BulkRunProgress from "../components/marketplace/BulkRunProgress";
import type { BulkSkip } from "../utils/bulkListing";
import type { Card } from "../types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: null,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Elsa",
    subtitle: "Snow Queen",
    character: "Elsa",
    types: ["Hero"],
    cardType: "Character",
    color: "Amethyst",
    setCode: "TFC",
    setName: "The First Chapter",
    rarity: "Legendary",
    inkCost: 5,
    inkable: true,
    strength: 3,
    willpower: 3,
    lore: 2,
    abilities: "Evasive",
    cardNumber: "42",
    foilTypes: ["None", "Silver"],
    imageUrl: "",
    prices: [],
    ...overrides,
  };
}

function makeSkip(
  overrides: Partial<Card> = {},
  reason: BulkSkip["reason"] = "no copies available (reserved or listed elsewhere)"
): BulkSkip {
  const card = makeCard(overrides);
  return {
    card,
    entry: {
      id: `inv_${card.id}`,
      userId: "seller_1",
      cardId: card.id,
      quantity: 1,
      foilQuantity: 0,
      holofoilQuantity: 0,
      card,
    },
    reason,
  };
}

function normalizedText(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

describe("BulkListingSkipList", () => {
  it("renders the preview's no-copies reason with the card identity (AC-BULK-6.2)", () => {
    render(<BulkListingSkipList skipped={[makeSkip()]} />);

    expect(screen.getByRole("heading", { name: "Not included (1)" })).toBeInTheDocument();
    expect(screen.getByText("Elsa")).toBeInTheDocument();
    expect(screen.getByText("· The First Chapter · 42")).toBeInTheDocument();
    expect(normalizedText(screen.getByRole("listitem"))).toContain(
      "— no copies available (reserved or listed elsewhere)"
    );
  });

  it("picks the already-listed reason per row (AC-BULK-6.2)", () => {
    render(<BulkListingSkipList skipped={[makeSkip({}, "already listed")]} />);

    expect(screen.getByText("Not included (1)")).toBeInTheDocument();
    expect(normalizedText(screen.getByRole("listitem"))).toContain("— already listed");
  });

  it("omits the metadata separator when the card has no set name or number", () => {
    render(<BulkListingSkipList skipped={[makeSkip({ setName: "", setCode: "", cardNumber: "" })]} />);

    const item = screen.getByRole("listitem");
    expect(item.textContent).not.toContain("·");
    expect(item.textContent).toContain("Elsa");
    expect(item.textContent).toContain("no copies available (reserved or listed elsewhere)");
  });

  it("renders nothing when nothing was skipped", () => {
    const { container } = render(<BulkListingSkipList skipped={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Not included/)).not.toBeInTheDocument();
  });
});

describe("BulkRunProgress", () => {
  it("reports determinate progress with a percentage and the last-item line", () => {
    render(<BulkRunProgress current={3} total={4} lastLine="Last: Elsa · The First Chapter · 42 — created" />);

    expect(screen.getByText("Creating 3 of 4 listings…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Creating 3 of 4 listings"
    );
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(
      screen.getByText("Last: Elsa · The First Chapter · 42 — created")
    ).toBeInTheDocument();
  });

  it("stays at zero percent for an empty run and omits the last-item line (total === 0)", () => {
    render(<BulkRunProgress current={0} total={0} lastLine={null} />);

    expect(screen.getByText("Creating 0 of 0 listings…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "0");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText(/^Last:/)).not.toBeInTheDocument();
  });
});
