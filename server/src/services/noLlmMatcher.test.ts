import assert from "node:assert/strict";
import test from "node:test";
import { buildRecognizedOcr, parseCollectorIdentifier, rankNoLlmMatches } from "./noLlmMatcher.js";

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
    },
    {
      id: "right",
      cardNumber: "1/204 • EN • 1",
      setCode: "1",
      name: "Ariel",
      subtitle: "On Human Legs",
      cardType: "Character",
      types: ["Storyborn"],
    },
  ];

  const matches = rankNoLlmMatches(cards, buildRecognizedOcr({ fullIdentifier: "1/204 • EN • 1", name: "Arie1" }));

  assert.equal(matches[0].card.id, "right");
  assert.ok(matches[0].score > matches[1].score);
});
