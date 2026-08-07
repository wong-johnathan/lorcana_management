import { describe, expect, it } from "vitest";
import { extractOcrEvidence } from "../ocrEvidence.js";

const cards = [
  { name: "Moana", subtitle: "Adventurer of Land and Sea", cardType: "Character" },
  { name: "Vaiana", subtitle: "Adventurer of Land and Sea", cardType: "Character" },
  { name: "Never Land", subtitle: "Mermaid Lagoon", cardType: "Location" },
];

describe("extractOcrEvidence", () => {
  it("finds a candidate name in OCR text to resolve identifier collisions", () => {
    expect(
      extractOcrEvidence(
        {
          collectorIdentifier: "26/P2 • EN • 7",
          rawText: "MOANA\nAdventurer of Land and Sea\n26/P2 • EN • 7",
        },
        cards
      )
    ).toMatchObject({ name: "Moana", subtitle: "Adventurer of Land and Sea" });
  });

  it("detects location type from OCR text", () => {
    expect(
      extractOcrEvidence(
        {
          collectorIdentifier: "32/204 • EN • 3",
          rawText: "Never Land\nMermaid Lagoon\nLOCATION\n32/204 • EN • 3",
        },
        cards
      )
    ).toMatchObject({ name: "Never Land", cardType: "Location" });
  });

  it("does not invent a name when OCR text has no candidate", () => {
    expect(
      extractOcrEvidence({ collectorIdentifier: null, rawText: "blurred text" }, cards).name
    ).toBeUndefined();
  });
});
