import { describe, expect, it } from "vitest";
import type { Card, MarketplaceListingPhoto } from "../types";
import {
  cardArtCaption,
  hasCardArt,
  listingImageItems,
  photoCaption,
  photoStartIndex,
} from "../utils/listingImages";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card_1",
    externalId: 1,
    tcgPlayerId: null,
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
    rarity: "Legendary",
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

function makePhoto(overrides: Partial<MarketplaceListingPhoto> = {}): MarketplaceListingPhoto {
  return {
    id: "photo_1",
    url: "https://img.example/cond.jpg",
    sortOrder: 1,
    label: null,
    ...overrides,
  };
}

describe("hasCardArt", () => {
  it("is true when the card has a non-empty imageUrl", () => {
    expect(hasCardArt(makeCard({ imageUrl: "https://img.example/a.jpg" }))).toBe(true);
  });

  it("is false when imageUrl is empty (the no-art source of truth)", () => {
    expect(hasCardArt(makeCard({ imageUrl: "" }))).toBe(false);
  });

  it("is false for null and undefined cards", () => {
    expect(hasCardArt(null)).toBe(false);
    expect(hasCardArt(undefined)).toBe(false);
  });
});

describe("cardArtCaption", () => {
  it("joins name, set name, and collector number verbatim with ' · '", () => {
    expect(cardArtCaption(makeCard())).toBe(
      "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1"
    );
  });

  it("drops empty segments", () => {
    expect(
      cardArtCaption(makeCard({ setName: "", cardNumber: "" }))
    ).toBe("Elsa, Snow Queen");
  });

  it("returns an empty string for a null or undefined card", () => {
    expect(cardArtCaption(null)).toBe("");
    expect(cardArtCaption(undefined)).toBe("");
  });
});

describe("photoCaption", () => {
  it("uses the position label when set", () => {
    expect(photoCaption({ label: "Front" })).toBe("Front");
    expect(photoCaption({ label: "Other" })).toBe("Other");
  });

  it("falls back to 'condition photo' for null and empty-string labels", () => {
    expect(photoCaption({ label: null })).toBe("condition photo");
    expect(photoCaption({ label: "" })).toBe("condition photo");
  });
});

describe("listingImageItems", () => {
  it("puts the card art first when present, then photos in wire order", () => {
    const photos = [
      makePhoto({ id: "p1", url: "https://img.example/p1.jpg", sortOrder: 1 }),
      makePhoto({ id: "p2", url: "https://img.example/p2.jpg", sortOrder: 0 }),
    ];
    expect(listingImageItems(makeCard(), photos)).toEqual([
      {
        src: "/api/card-images/card_1",
        caption: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1",
      },
      { src: "https://img.example/p1.jpg", caption: "condition photo" },
      { src: "https://img.example/p2.jpg", caption: "condition photo" },
    ]);
  });

  it("omits the card-art entry when there is no art", () => {
    const photos = [
      makePhoto({ id: "p1", url: "https://img.example/p1.jpg", label: "Front" }),
    ];
    expect(listingImageItems(makeCard({ imageUrl: "" }), photos)).toEqual([
      { src: "https://img.example/p1.jpg", caption: "Front" },
    ]);
  });

  it("returns only the card art when there are no photos", () => {
    expect(listingImageItems(makeCard(), [])).toEqual([
      {
        src: "/api/card-images/card_1",
        caption: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1",
      },
    ]);
  });

  it("returns an empty list for a null card with no photos", () => {
    expect(listingImageItems(null, [])).toEqual([]);
  });

  it("does not re-sort photos (preserves wire order)", () => {
    const photos = [
      makePhoto({ id: "p3", url: "https://img.example/p3.jpg", sortOrder: 3 }),
      makePhoto({ id: "p1", url: "https://img.example/p1.jpg", sortOrder: 1 }),
      makePhoto({ id: "p2", url: "https://img.example/p2.jpg", sortOrder: 2 }),
    ];
    const items = listingImageItems(makeCard(), photos);
    expect(items.map((item) => item.src)).toEqual([
      "/api/card-images/card_1",
      "https://img.example/p3.jpg",
      "https://img.example/p1.jpg",
      "https://img.example/p2.jpg",
    ]);
  });
});

describe("photoStartIndex", () => {
  it("offsets by one when the card has art", () => {
    const photos = [
      makePhoto({ id: "p1" }),
      makePhoto({ id: "p2" }),
    ];
    expect(photoStartIndex(makeCard(), photos, photos[1])).toBe(2);
  });

  it("does not offset when the card has no art", () => {
    const photos = [makePhoto({ id: "p1" })];
    expect(photoStartIndex(makeCard({ imageUrl: "" }), photos, photos[0])).toBe(0);
  });

  it("returns -1 (misuse) when the photo is not in the array and there is no art", () => {
    const photos: MarketplaceListingPhoto[] = [];
    expect(photoStartIndex(makeCard({ imageUrl: "" }), photos, makePhoto())).toBe(-1);
  });
});
