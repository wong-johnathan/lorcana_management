import assert from "node:assert/strict";
import test from "node:test";
import { chooseBestOrientation, scoreIdentifierOcr } from "../src/pages/beta/noLlmOrientation";

test("scoreIdentifierOcr rewards valid Lorcana collector identifiers", () => {
  assert.ok(scoreIdentifierOcr("204/204 • EN • 8") > scoreIdentifierOcr("RY ek kK"));
  assert.ok(scoreIdentifierOcr("2O4/2O4 EN B") >= 70);
});

test("chooseBestOrientation picks the rotation with readable identifier text", () => {
  const best = chooseBestOrientation([
    { degrees: 0, flipX: false, identifier: "Te TT." },
    { degrees: 90, flipX: false, identifier: "LALCY ASEmmsna" },
    { degrees: 180, flipX: false, identifier: "204/204 EN 8" },
    { degrees: 270, flipX: false, identifier: "RY ek kK" },
  ]);

  assert.equal(best.degrees, 180);
  assert.equal(best.flipX, false);
  assert.ok(best.score >= 80);
});

test("chooseBestOrientation can select a flipped mobile camera correction", () => {
  const best = chooseBestOrientation([
    { degrees: 0, flipX: false, identifier: "Te TT." },
    { degrees: 90, flipX: false, identifier: "ASEmmsna" },
    { degrees: 90, flipX: true, identifier: "204/204 EN 8" },
    { degrees: 180, flipX: false, identifier: "RY ek kK" },
  ]);

  assert.equal(best.degrees, 90);
  assert.equal(best.flipX, true);
  assert.ok(best.score >= 80);
});
