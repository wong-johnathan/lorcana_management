import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterBar from "../components/FilterBar";
import MarketplaceFilterBar from "../components/marketplace/MarketplaceFilterBar";
import type { FilterOptions } from "../types";
import type { MarketplaceControls } from "../utils/marketplaceParams";

const OPTIONS: FilterOptions = {
  sets: ["The First Chapter", "Rise of the Floodborn"],
  colors: ["Amber", "Amethyst"],
  rarities: ["Common", "Rare"],
  types: ["Song", "Item"],
  cardTypes: ["Character", "Action"],
  costs: [1, 2, 3],
  inkable: ["inkable", "non-inkable"],
};

const EMPTY_CONTROLS: MarketplaceControls = {
  q: "",
  variant: "",
  condition: "",
  priceMin: "",
  priceMax: "",
  currency: "",
  costs: "",
  inkable: "",
  cardTypes: "",
  subtypes: "",
  colors: "",
  sets: "",
  rarities: "",
  page: 1,
};

/** Force `useMediaQuery` to report a desktop (`true`) or phone (`false`) viewport. */
function setViewport(isDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: isDesktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  vi.restoreAllMocks();
});

describe("marketplace filters — mobile", () => {
  it("keeps search inline and hides the rest behind a filter sheet", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(
      <MarketplaceFilterBar controls={EMPTY_CONTROLS} onChange={() => {}} optionSource={OPTIONS} />
    );

    // Search stays inline so the common action needs no extra tap.
    expect(screen.getByPlaceholderText("Search by name or set...")).toBeInTheDocument();
    // Everything else is out of the way until the sheet opens.
    expect(screen.queryByLabelText("Variant")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All Sets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByRole("dialog", { name: "Filter listings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Variant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Sets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Costs" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet on Escape", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(
      <MarketplaceFilterBar controls={EMPTY_CONTROLS} onChange={() => {}} optionSource={OPTIONS} />
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("badges the trigger with the active filter count", () => {
    setViewport(false);
    render(
      <MarketplaceFilterBar
        controls={{ ...EMPTY_CONTROLS, sets: "The First Chapter", q: "elsa" }}
        onChange={() => {}}
        optionSource={OPTIONS}
      />
    );

    expect(screen.getByRole("button", { name: "Filters (2)" })).toBeInTheDocument();
  });
});

describe("marketplace filters — desktop", () => {
  it("renders the full bar with no filter trigger", () => {
    setViewport(true);
    render(
      <MarketplaceFilterBar controls={EMPTY_CONTROLS} onChange={() => {}} optionSource={OPTIONS} />
    );

    expect(screen.getByLabelText("Variant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Sets" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filters/ })).not.toBeInTheDocument();
  });
});

describe("collection filters — mobile", () => {
  it("moves the filter controls into the sheet", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<FilterBar filters={{}} onChange={() => {}} optionSource={OPTIONS} />);

    expect(screen.getByPlaceholderText("Search by name...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All Sets" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Sets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Colors" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show results" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores the bulk-forced spares filter in the badge", () => {
    setViewport(false);
    render(
      <FilterBar
        filters={{ spares: "1" }}
        onChange={() => {}}
        optionSource={OPTIONS}
        mode="picker"
        lockSparesOn
      />
    );

    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });
});

describe("collection filters — desktop", () => {
  it("renders the inline bar unchanged", () => {
    setViewport(true);
    render(<FilterBar filters={{}} onChange={() => {}} optionSource={OPTIONS} />);

    expect(screen.getByRole("button", { name: "All Sets" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filters/ })).not.toBeInTheDocument();
  });
});
