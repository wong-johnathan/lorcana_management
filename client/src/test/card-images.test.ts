import { describe, expect, it } from "vitest";
import { cardImageUrl } from "../utils/cardImages";

describe("cardImageUrl", () => {
  it("uses the app-controlled card image cache endpoint when a card id is present", () => {
    expect(cardImageUrl({ id: "card 1", imageUrl: "https://source.example/card.jpg" })).toBe("/api/card-images/card%201");
  });

  it("falls back to the source image URL for incomplete card-like data", () => {
    expect(cardImageUrl({ id: "", imageUrl: "https://source.example/card.jpg" })).toBe("https://source.example/card.jpg");
  });
});
