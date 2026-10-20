import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ListingImageGallery from "../components/marketplace/ListingImageGallery";
import { useThumbnailStripOverflow } from "../components/marketplace/useThumbnailStripOverflow";
import type { Card, MarketplaceListingPhoto } from "../types";

/* ------------------------------------------------------------------ */
/* ResizeObserver stub — jsdom does not implement it (design §11.2).   */
/* Kept in this file on purpose; setup.ts stays untouched.             */
/* ------------------------------------------------------------------ */

type ObserverCallback = () => void;

const observers: ResizeObserverStub[] = [];

class ResizeObserverStub {
  callback: ObserverCallback;

  constructor(callback: ObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(): void {
    /* the gallery only observes its strip; measurements are mocked */
  }

  disconnect(): void {
    /* nothing to release */
  }
}

function installedObservers(): ResizeObserverStub[] {
  return observers;
}

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const CARD_ART_SRC = "/api/card-images/card_elsa";
const CARD_ART_CAPTION = "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_elsa",
    externalId: 1,
    tcgPlayerId: 100,
    cardTraderUrl: null,
    cardmarketUrl: null,
    name: "Elsa, Snow Queen",
    subtitle: "Ice Queen",
    character: "Elsa",
    types: ["Hero"],
    cardType: "Character",
    color: "Amethyst",
    setCode: "TFC",
    setName: "The First Chapter",
    rarity: "Enchanted",
    inkCost: 5,
    inkable: true,
    strength: 3,
    willpower: 3,
    lore: 2,
    abilities: "Evasive",
    cardNumber: "1/204 • EN • 1",
    foilTypes: ["None", "Silver"],
    imageUrl: "https://img.example/elsa.jpg",
    prices: [],
    ...overrides,
  };
}

function photo(id: string, label: string | null, sortOrder: number): MarketplaceListingPhoto {
  return { id, url: `https://img.example/${id}.jpg`, sortOrder, label };
}

const front = photo("front", "Front", 0);
const back = photo("back", "Back", 1);

function renderGallery(card: Card | null, photos: MarketplaceListingPhoto[]) {
  return render(<ListingImageGallery card={card} photos={photos} />);
}

function primaryTrigger(): HTMLElement {
  return screen.getByRole("button", { name: /^View / });
}

function thumbnailButtons(): HTMLElement[] {
  return within(screen.getByRole("group", { name: "Image thumbnails" })).getAllByRole("button");
}

function thumbnailsGroup(): HTMLElement | null {
  return screen.queryByRole("group", { name: "Image thumbnails" });
}

function chevron(direction: "left" | "right"): HTMLElement | null {
  return screen.queryByRole("button", { name: `Scroll thumbnails ${direction}` });
}

interface StripState {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

/** Mock the strip's layout measurements (jsdom reports 0 for all of them). */
function mockStripMeasurements(initial: StripState): StripState {
  const strip = thumbnailsGroup() as HTMLElement;
  const state: StripState = { ...initial };
  Object.defineProperty(strip, "scrollWidth", { configurable: true, get: () => state.scrollWidth });
  Object.defineProperty(strip, "clientWidth", { configurable: true, get: () => state.clientWidth });
  Object.defineProperty(strip, "scrollLeft", {
    configurable: true,
    get: () => state.scrollLeft,
    set: (value: number) => {
      state.scrollLeft = value;
    },
  });
  return state;
}

/** Run the hook's ResizeObserver callback, as a real resize would. */
function triggerObserver() {
  act(() => {
    for (const observer of installedObservers()) observer.callback();
  });
}

describe("ListingImageGallery", () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts on the card art with one thumbnail per image, in order (AC-GAL-1.1, 2.1, 2.2, 3.1)", () => {
    renderGallery(makeCard(), [front, back]);

    const primary = primaryTrigger();
    expect(primary).toHaveAccessibleName(`View ${CARD_ART_CAPTION}`);
    expect(within(primary).getByRole("img")).toHaveAttribute("src", CARD_ART_SRC);
    expect(screen.getByText(CARD_ART_CAPTION)).toBeInTheDocument();

    const thumbs = thumbnailButtons();
    expect(thumbs).toHaveLength(3);
    expect(thumbs.map((thumb) => thumb.querySelector("img")?.getAttribute("src"))).toEqual([
      CARD_ART_SRC,
      front.url,
      back.url,
    ]);
    expect(thumbs[0]).toHaveAttribute("aria-pressed", "true");
    expect(thumbs[1]).toHaveAttribute("aria-pressed", "false");
    expect(thumbs[2]).toHaveAttribute("aria-pressed", "false");
    expect(thumbs[0]).toHaveAccessibleName(`${CARD_ART_CAPTION}, image 1 of 3`);
    expect(thumbs[1]).toHaveAccessibleName("Front, image 2 of 3");

    // The two old image sections are gone (one merged gallery).
    expect(screen.queryByRole("heading", { name: /actual condition photos/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Card" })).toBeNull();
    // One primary <img> plus one cover-cropped <img> per thumbnail (alt="").
    expect(screen.getByRole("region", { name: "Listing images" }).querySelectorAll("img")).toHaveLength(4);
    // No chevrons while the strip does not overflow (AC-GAL-3.6).
    expect(chevron("left")).toBeNull();
    expect(chevron("right")).toBeNull();
  });

  it("selecting a thumbnail swaps the primary image, caption and pressed state without opening the lightbox (AC-GAL-3.3, 3.4, 5.2)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), [front, back]);

    const thumbs = thumbnailButtons();
    await user.click(thumbs[1]);

    const primary = primaryTrigger();
    expect(primary).toHaveAccessibleName("View Front");
    expect(primary).toHaveAttribute("aria-label", "View Front");
    expect(within(primary).getByRole("img")).toHaveAttribute("src", front.url);
    expect(within(primary).getByRole("img")).toHaveAttribute("alt", "Front");
    expect(screen.getByText("Front")).toBeInTheDocument();

    expect(thumbs[1]).toHaveAttribute("aria-pressed", "true");
    expect(thumbs[0]).toHaveAttribute("aria-pressed", "false");
    expect(thumbs.filter((thumb) => thumb.getAttribute("aria-pressed") === "true")).toHaveLength(1);

    // No lightbox and no focus move (the click's own focus stays on the thumbnail).
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(thumbs[1]);
  });

  it("opens the lightbox at the selected image with its caption and N / M (AC-GAL-6.1, 6.2)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), [front, back]);

    await user.click(thumbnailButtons()[2]);
    await user.click(primaryTrigger());

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Back");
    expect(within(dialog).getByRole("img", { name: "Back" })).toHaveAttribute("src", back.url);
    expect(within(dialog).getByText("3 / 3")).toBeInTheDocument();
    expect(within(dialog).getByText("Back")).toBeInTheDocument();
  });

  it("keeps the gallery selection when the lightbox navigates and closes (AC-GAL-6.4, 8.4)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), [front, back]);

    await user.click(primaryTrigger());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("1 / 3")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(primaryTrigger()).toHaveAccessibleName(`View ${CARD_ART_CAPTION}`);
    expect(thumbnailButtons()[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(CARD_ART_CAPTION)).toBeInTheDocument();
    // Focus returns to the primary trigger (the lightbox keeps its contract).
    expect(primaryTrigger()).toHaveFocus();
  });

  it("renders photos only, with the first photo as primary, when the card has no art (AC-GAL-2.4)", () => {
    renderGallery(makeCard({ imageUrl: "" }), [front, back]);

    expect(within(primaryTrigger()).getByRole("img")).toHaveAttribute("src", front.url);
    expect(primaryTrigger()).toHaveAccessibleName("View Front");
    expect(screen.getByText("Front")).toBeInTheDocument();

    const thumbs = thumbnailButtons();
    expect(thumbs).toHaveLength(2);
    expect(thumbs.map((thumb) => thumb.querySelector("img")?.getAttribute("src"))).toEqual([
      front.url,
      back.url,
    ]);
    expect(screen.queryByText(CARD_ART_CAPTION)).toBeNull();
  });

  it("renders a lone image without a strip but still opens the single-image lightbox (AC-GAL-2.5)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), []);

    expect(thumbnailsGroup()).toBeNull();
    expect(chevron("left")).toBeNull();
    expect(chevron("right")).toBeNull();
    expect(primaryTrigger()).toHaveAccessibleName(`View ${CARD_ART_CAPTION}`);
    expect(screen.getByText(CARD_ART_CAPTION)).toBeInTheDocument();

    await user.click(primaryTrigger());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("1 / 1")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Next image" })).toBeDisabled();
  });

  it("renders a non-triggerable placeholder when there are no images at all (AC-GAL-7.1)", () => {
    renderGallery(makeCard({ imageUrl: "" }), []);

    expect(screen.getByText("No condition photos")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("region", { name: "Listing images" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Image thumbnails" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to the logo in both slots without losing the caption (AC-GAL-7.3)", () => {
    renderGallery(makeCard(), [front, back]);

    const primary = primaryTrigger();
    fireEvent.error(within(primary).getByRole("img"));
    expect(within(primary).getByRole("img")).toHaveAttribute("src", "/lorcana-logo.png");
    expect(primary).toHaveAccessibleName(`View ${CARD_ART_CAPTION}`);

    const thumbs = thumbnailButtons();
    fireEvent.error(thumbs[1].querySelector("img") as HTMLImageElement);
    expect(thumbs[1].querySelector("img")).toHaveAttribute("src", "/lorcana-logo.png");
    expect(thumbs[1]).toHaveAccessibleName("Front, image 2 of 3");
    expect(screen.getByText(CARD_ART_CAPTION)).toBeInTheDocument();
  });

  it("orders focus primary → thumbnails → chevrons and is keyboard operable (AC-GAL-8.1, 3.5, 6.1)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), [front, back]);

    // Enough overflow that both chevrons mount and are enabled.
    mockStripMeasurements({ scrollWidth: 888, clientWidth: 184, scrollLeft: 300 });
    triggerObserver();

    const thumbs = thumbnailButtons();
    const left = chevron("left") as HTMLElement;
    const right = chevron("right") as HTMLElement;
    expect(left).toBeEnabled();
    expect(right).toBeEnabled();

    await user.tab();
    expect(primaryTrigger()).toHaveFocus();
    await user.tab();
    expect(thumbs[0]).toHaveFocus();
    await user.tab();
    expect(thumbs[1]).toHaveFocus();
    await user.tab();
    expect(thumbs[2]).toHaveFocus();
    await user.tab();
    expect(left).toHaveFocus();
    await user.tab();
    expect(right).toHaveFocus();

    // Enter and Space both select a thumbnail.
    thumbs[2].focus();
    await user.keyboard("{Enter}");
    expect(thumbs[2]).toHaveAttribute("aria-pressed", "true");
    thumbs[1].focus();
    await user.keyboard(" ");
    expect(thumbs[1]).toHaveAttribute("aria-pressed", "true");

    // Enter on the primary opens the lightbox.
    primaryTrigger().focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Front");
  });

  it("composes thumbnail names from the caption with an Image k of M fallback and disambiguates duplicates (AC-GAL-5.4, 8.3)", () => {
    renderGallery(makeCard({ name: "", setName: "", cardNumber: "" }), [
      photo("one", null, 0),
      photo("two", "Front", 1),
      photo("three", "Front", 2),
    ]);

    // Empty computed caption (E6) → fallback copy, no empty trigger name.
    expect(primaryTrigger()).toHaveAccessibleName("View Image 1 of 4");
    expect(screen.getByText("Image 1 of 4")).toBeInTheDocument();

    const thumbs = thumbnailButtons();
    expect(thumbs.map((thumb) => thumb.getAttribute("aria-label"))).toEqual([
      "Image 1 of 4",
      // Unlabeled photo caption comes from photoCaption().
      "condition photo, image 2 of 4",
      "Front, image 3 of 4",
      "Front, image 4 of 4",
    ]);
    // Duplicate captions stay distinguishable via the position suffix.
    expect(thumbs[2]).toHaveAccessibleName("Front, image 3 of 4");
    expect(thumbs[3]).toHaveAccessibleName("Front, image 4 of 4");
  });

  /* ---------------------------------------------------------------- */
  /* Overflow / chevrons (design §11.2)                                */
  /* ---------------------------------------------------------------- */

  it("renders no chevrons when the strip fits (AC-GAL-3.6)", () => {
    renderGallery(makeCard(), [front, back]);

    mockStripMeasurements({ scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    triggerObserver();

    expect(chevron("left")).toBeNull();
    expect(chevron("right")).toBeNull();
  });

  it("mounts both chevrons on overflow, disables the exhausted end and scrolls by one step (AC-GAL-3.6)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), [front, back]);

    const state = mockStripMeasurements({ scrollWidth: 888, clientWidth: 184, scrollLeft: 0 });
    triggerObserver();

    const left = chevron("left") as HTMLElement;
    const right = chevron("right") as HTMLElement;
    expect(left).toBeInTheDocument();
    expect(right).toBeInTheDocument();
    expect(left).toBeDisabled();
    expect(right).toBeEnabled();

    // jsdom has no Element.scrollBy → the `scrollLeft +=` fallback runs.
    // Step = clientWidth - (thumbnail width 0 + 8 px gap) = 176.
    await user.click(right);
    expect(state.scrollLeft).toBe(176);

    // A native scroll event re-reads the ends.
    fireEvent.scroll(thumbnailsGroup() as HTMLElement);
    expect(chevron("left")).toBeEnabled();

    // Selection is preserved across overflow re-measurement (S14).
    const thumbs = thumbnailButtons();
    await user.click(thumbs[1]);
    expect(thumbs[1]).toHaveAttribute("aria-pressed", "true");

    // At the far end the right chevron is disabled rather than hidden.
    state.scrollLeft = 888 - 184;
    fireEvent.scroll(thumbnailsGroup() as HTMLElement);
    expect(chevron("right")).toBeDisabled();
    expect(chevron("left")).toBeEnabled();

    await user.click(chevron("left") as HTMLElement);
    expect(state.scrollLeft).toBe(888 - 184 - 176);
  });

  it("prefers the element scrollBy and honours prefers-reduced-motion (AC-GAL-3.6)", async () => {
    const user = userEvent.setup();
    renderGallery(makeCard(), [front, back]);

    mockStripMeasurements({ scrollWidth: 888, clientWidth: 184, scrollLeft: 300 });
    const strip = thumbnailsGroup() as HTMLElement;
    const scrollBySpy = vi.fn();
    Object.defineProperty(strip, "scrollBy", { configurable: true, value: scrollBySpy });
    triggerObserver();

    await user.click(chevron("right") as HTMLElement);
    expect(scrollBySpy).toHaveBeenCalledWith({ left: 176, behavior: "smooth" });

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    await user.click(chevron("left") as HTMLElement);
    expect(scrollBySpy).toHaveBeenLastCalledWith({ left: -176, behavior: "auto" });
  });

  it("still measures overflow through the window resize fallback without a ResizeObserver (design §3.2)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("ResizeObserver", undefined);
    renderGallery(makeCard(), [front, back]);

    const state = mockStripMeasurements({ scrollWidth: 888, clientWidth: 184, scrollLeft: 0 });
    fireEvent(window, new Event("resize"));

    expect(chevron("right")).toBeEnabled();
    expect(chevron("left")).toBeDisabled();

    await user.click(chevron("right") as HTMLElement);
    expect(state.scrollLeft).toBe(176);
  });

  it("is a no-op when scrollBy is called without a mounted strip", () => {
    const { result } = renderHook(() => useThumbnailStripOverflow({ current: null }, 0));

    expect(result.current).toMatchObject({
      overflow: false,
      canScrollLeft: false,
      canScrollRight: false,
    });

    act(() => {
      result.current.scrollBy(120);
    });

    expect(result.current.overflow).toBe(false);
  });
});
