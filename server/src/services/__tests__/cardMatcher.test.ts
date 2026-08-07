import { describe, expect, it } from "vitest";
import { matchCards, type MatchableCard } from "../cardMatcher.js";

const cards: MatchableCard[] = [
  {
    id: "set1-ariel",
    name: "Ariel",
    subtitle: "On Human Legs",
    cardNumber: "1/204 • EN • 1",
    setCode: "1",
    inkCost: 4,
    cardType: "Character",
  },
  {
    id: "set2-bashful",
    name: "Bashful",
    subtitle: "Hopeless Romantic",
    cardNumber: "1/204 • EN • 2",
    setCode: "2",
    inkCost: 1,
    cardType: "Character",
  },
  {
    id: "moana",
    name: "Moana",
    subtitle: "Adventurer of Land and Sea",
    cardNumber: "26/P2 • EN • 7",
    setCode: "7",
    inkCost: 5,
    cardType: "Character",
  },
  {
    id: "vaiana",
    name: "Vaiana",
    subtitle: "Adventurer of Land and Sea",
    cardNumber: "26/P2 • EN • 7",
    setCode: "7",
    inkCost: 5,
    cardType: "Character",
  },
];

describe("matchCards", () => {
  it("returns an exact decision for a unique full identifier", () => {
    const result = matchCards(
      { collectorIdentifier: "1/204 • EN • 1" },
      cards
    );

    expect(result.decision).toBe("exact");
    expect(result.candidates[0]?.card.id).toBe("set1-ariel");
    expect(result.candidates[0]?.reasons).toContain("collector_identifier_exact");
  });

  it("does not treat a repeated short number as exact", () => {
    const result = matchCards({ collectorIdentifier: "1/204" }, cards);

    expect(result.decision).toBe("ambiguous");
    expect(result.candidates.slice(0, 2).map((candidate) => candidate.card.id).sort()).toEqual([
      "set1-ariel",
      "set2-bashful",
    ]);
  });

  it("uses name evidence to resolve a full-identifier collision", () => {
    const result = matchCards(
      {
        collectorIdentifier: "26/P2 • EN • 7",
        name: "Moana",
        subtitle: "Adventurer of Land and Sea",
      },
      cards
    );

    expect(result.decision).toBe("exact");
    expect(result.candidates[0]?.card.id).toBe("moana");
    expect(result.candidates[0]?.reasons.some((reason) => reason.startsWith("name_similarity:"))).toBe(true);
  });

  it("uses set and title evidence to select a high-confidence short match", () => {
    const result = matchCards(
      {
        collectorIdentifier: "1/204",
        setCode: "2",
        name: "Bashful",
        subtitle: "Hopeless Romantic",
        inkCost: 1,
        cardType: "Character",
      },
      cards
    );

    expect(["exact", "high"]).toContain(result.decision);
    expect(result.candidates[0]?.card.id).toBe("set2-bashful");
  });

  it("returns none instead of guessing from insufficient evidence", () => {
    const result = matchCards({ name: "Unknown Person" }, cards);

    expect(result.decision).toBe("none");
    expect(result.candidates).toEqual([]);
  });
});
