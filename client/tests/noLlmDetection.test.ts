import assert from "node:assert/strict";
import test from "node:test";
import { getRectangleShapeAspect, isCardShapeAspect, scoreCardCandidate } from "../src/pages/beta/noLlmDetection";

test("getRectangleShapeAspect treats sideways and upright rectangles the same", () => {
  assert.equal(getRectangleShapeAspect(140, 100), getRectangleShapeAspect(100, 140));
});

test("isCardShapeAspect accepts rotated TCG-like rectangles", () => {
  const sidewaysCard = getRectangleShapeAspect(140, 100);

  assert.ok(isCardShapeAspect(sidewaysCard));
});

test("isCardShapeAspect rejects very skinny background lines", () => {
  assert.equal(isCardShapeAspect(getRectangleShapeAspect(400, 30)), false);
});

test("scoreCardCandidate rejects tiny centered internal rectangles", () => {
  const internalArtworkBox = scoreCardCandidate({
    aspectRatio: getRectangleShapeAspect(120, 165),
    fillRatio: 0.72,
    areaRatio: 0.045,
    centerOffset: 0.02,
  });
  const wholeCard = scoreCardCandidate({
    aspectRatio: getRectangleShapeAspect(315, 440),
    fillRatio: 0.72,
    areaRatio: 0.31,
    centerOffset: 0.08,
  });

  assert.equal(internalArtworkBox, 0);
  assert.ok(wholeCard > 0.75);
});
