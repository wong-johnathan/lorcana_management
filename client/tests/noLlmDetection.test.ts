import assert from "node:assert/strict";
import test from "node:test";
import { getRectangleShapeAspect, isCardShapeAspect } from "../src/pages/beta/noLlmDetection";

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
