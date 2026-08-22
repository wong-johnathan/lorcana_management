import assert from "node:assert/strict";
import test from "node:test";
import { chooseBestOrientation, scoreIdentifierOcr } from "../src/pages/beta/noLlmOrientation";

test("scoreIdentifierOcr rewards valid Lorcana collector identifiers", () => {
  assert.ok(scoreIdentifierOcr("204/204 • EN • 8") > scoreIdentifierOcr("RY ek kK"));
  assert.ok(scoreIdentifierOcr("2O4/2O4 EN B") >= 70);
});

test("chooseBestOrientation picks the rotation with readable identifier text", () => {
  const best = chooseBestOrientation([
    { degrees: 0, identifier: "Te TT." },
    { degrees: 90, identifier: "LALCY ASEmmsna" },
    { degrees: 180, identifier: "204/204 EN 8" },
    { degrees: 270, identifier: "RY ek kK" },
  ]);

  assert.equal(best.degrees, 180);
  assert.ok(best.score >= 80);
});
