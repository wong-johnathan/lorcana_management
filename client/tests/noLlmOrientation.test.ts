import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseBestOrientation,
  formatManualOrientation,
  rotateManualOrientation,
  scoreIdentifierOcr,
  scoreReadableTextOcr,
  toggleManualFlipX,
  toggleManualFlipY,
} from "../src/pages/beta/noLlmOrientation";

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

test("scoreReadableTextOcr rewards readable title-like OCR over mirrored garbage", () => {
  assert.ok(scoreReadableTextOcr("IF I DIDN'T HAVE YOU") > scoreReadableTextOcr("UOY EVAH TNDID I FI"));
  assert.ok(scoreReadableTextOcr("IF I DIDN'T HAVE YOU") > scoreReadableTextOcr("ASEmmsna"));
});

test("chooseBestOrientation uses title text to break low-identifier ties for mobile mirroring", () => {
  const best = chooseBestOrientation([
    { degrees: 0, flipX: false, identifier: "", title: "UOY EVAH TNDID I FI" },
    { degrees: 0, flipX: true, identifier: "", title: "IF I DIDN'T HAVE YOU" },
    { degrees: 180, flipX: false, identifier: "", title: "ASEmmsna" },
  ]);

  assert.equal(best.degrees, 0);
  assert.equal(best.flipX, true);
});

test("manual orientation controls rotate and flip predictably", () => {
  const initial = { degrees: 0 as const, flipX: false, flipY: false };
  const rotated = rotateManualOrientation(initial, 90);
  const flippedX = toggleManualFlipX(rotated);
  const flippedY = toggleManualFlipY(flippedX);

  assert.deepEqual(rotated, { degrees: 90, flipX: false, flipY: false });
  assert.deepEqual(flippedX, { degrees: 90, flipX: true, flipY: false });
  assert.deepEqual(flippedY, { degrees: 90, flipX: true, flipY: true });
  assert.equal(formatManualOrientation(flippedY), "90° + flip H + flip V");
});

test("manual orientation rotation wraps around", () => {
  assert.deepEqual(rotateManualOrientation({ degrees: 0, flipX: false, flipY: false }, -90), {
    degrees: 270,
    flipX: false,
    flipY: false,
  });
});
