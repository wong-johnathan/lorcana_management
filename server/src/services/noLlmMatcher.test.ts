import assert from "node:assert/strict";
import test from "node:test";
import { buildRecognizedOcr, parseCollectorIdentifier, parseInkCost, rankNoLlmMatches } from "./noLlmMatcher.js";

test("parseCollectorIdentifier normalizes OCR substitutions and full identifiers", () => {
  assert.deepEqual(parseCollectorIdentifier("I/2O4 · EN · l"), {
    fullIdentifier: "1/204 • EN • 1",
    collectorNumber: "1/204",
    setCode: "1",
  });
});

test("buildRecognizedOcr derives identifier fields from raw OCR text", () => {
  const recognized = buildRecognizedOcr({ rawText: { identifier: "32/204 EN 3", title: "Mickey Mouse" } });

  assert.equal(recognized.fullIdentifier, "32/204 • EN • 3");
  assert.equal(recognized.collectorNumber, "32/204");
  assert.equal(recognized.setCode, "3");
  assert.equal(recognized.name, "Mickey Mouse");
});

test("rankNoLlmMatches prefers exact full identifier over fuzzy name", () => {
  const cards = [
    {
      id: "wrong",
      cardNumber: "1/204 • EN • 2",
      setCode: "2",
      name: "Ariel",
      subtitle: "On Human Legs",
      cardType: "Character",
      types: ["Storyborn"],
      inkCost: 3,
      color: "Amber",
    },
    {
      id: "right",
      cardNumber: "1/204 • EN • 1",
      setCode: "1",
      name: "Ariel",
      subtitle: "On Human Legs",
      cardType: "Character",
      types: ["Storyborn"],
      inkCost: 3,
      color: "Amber",
    },
  ];

  const matches = rankNoLlmMatches(cards, buildRecognizedOcr({ fullIdentifier: "1/204 • EN • 1", name: "Arie1" }));

  assert.equal(matches[0].card.id, "right");
  assert.ok(matches[0].score > matches[1].score);
});

test("parseInkCost normalizes common OCR substitutions", () => {
  assert.equal(parseInkCost("O"), 0);
  assert.equal(parseInkCost("l"), 1);
  assert.equal(parseInkCost("5"), 5);
});

test("rankNoLlmMatches uses ink cost and color as weak disambiguation hints", () => {
  const cards = [
    {
      id: "wrong-ink",
      cardNumber: "9/204 • EN • 3",
      setCode: "3",
      name: "Russell",
      subtitle: "Wilderness Explorer",
      cardType: "Character",
      types: ["Storyborn", "Hero"],
      inkCost: 4,
      color: "Amber",
    },
    {
      id: "right-ink",
      cardNumber: "10/204 • EN • 3",
      setCode: "3",
      name: "Russell",
      subtitle: "Wilderness Explorer",
      cardType: "Character",
      types: ["Storyborn", "Hero"],
      inkCost: 5,
      color: "Emerald",
    },
  ];

  const matches = rankNoLlmMatches(cards, buildRecognizedOcr({ name: "Russell", inkCost: "5", color: "Emerald" }));

  assert.equal(matches[0].card.id, "right-ink");
  assert.ok(matches[0].reasons.includes("Ink cost hint matches"));
  assert.ok(matches[0].reasons.includes("Ink color hint matches"));
});
