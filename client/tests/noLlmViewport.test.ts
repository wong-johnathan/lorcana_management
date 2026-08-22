import assert from "node:assert/strict";
import test from "node:test";
import { getCoverSourceRect, getTcgGuideRect, TCG_CARD_RATIO } from "../src/pages/beta/noLlmViewport";

test("getCoverSourceRect crops a 16:9 webcam feed into a TCG portrait viewport", () => {
  const crop = getCoverSourceRect(1920, 1080, 672, 936);

  assert.equal(crop.height, 1080);
  assert.ok(crop.width < 1920);
  assert.ok(crop.x > 0);
  assert.ok(Math.abs(crop.width / crop.height - TCG_CARD_RATIO) < 0.01);
});

test("getTcgGuideRect returns a centered TCG-aspect guide", () => {
  const guide = getTcgGuideRect(672, 936, 0.84);

  assert.ok(Math.abs(guide.width / guide.height - TCG_CARD_RATIO) < 0.01);
  assert.ok(Math.abs(guide.x - (672 - guide.width) / 2) < 1);
  assert.ok(Math.abs(guide.y - (936 - guide.height) / 2) < 1);
});
