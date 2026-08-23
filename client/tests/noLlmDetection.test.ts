import assert from "node:assert/strict";
import test from "node:test";
import { estimateImageSharpness, getRectangleShapeAspect, isCardShapeAspect, scoreCardCandidate } from "../src/pages/beta/noLlmDetection";

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

test("estimateImageSharpness scores crisp edges above flat blurry regions", () => {
  const width = 8;
  const height = 8;
  const flat = new Uint8ClampedArray(width * height * 4);
  const crisp = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    flat[i * 4] = 128;
    flat[i * 4 + 1] = 128;
    flat[i * 4 + 2] = 128;
    flat[i * 4 + 3] = 255;

    const value = i % 2 === 0 ? 255 : 0;
    crisp[i * 4] = value;
    crisp[i * 4 + 1] = value;
    crisp[i * 4 + 2] = value;
    crisp[i * 4 + 3] = 255;
  }

  assert.equal(estimateImageSharpness({ width, height, data: flat }), 0);
  assert.ok(estimateImageSharpness({ width, height, data: crisp }) > 1000);
});
