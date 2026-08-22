import assert from "node:assert/strict";
import test from "node:test";
import {
  getCoverSourceRect,
  getTcgGuideRect,
  mapPointFromDetectionFrameToVideo,
  mapPointsFromDetectionFrameToVideo,
  TCG_CARD_RATIO,
} from "../src/pages/beta/noLlmViewport";

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

test("mapPointFromDetectionFrameToVideo restores low-res detection points to the high-res video crop", () => {
  const sourceCrop = getCoverSourceRect(1920, 1080, 672, 936);
  const mapped = mapPointFromDetectionFrameToVideo({ x: 336, y: 468 }, 672, 936, sourceCrop);

  assert.ok(Math.abs(mapped.x - 960) < 0.01);
  assert.ok(Math.abs(mapped.y - 540) < 0.01);
});

test("mapPointsFromDetectionFrameToVideo preserves corner ordering for high-res crop warping", () => {
  const sourceCrop = getCoverSourceRect(1920, 1080, 672, 936);
  const points = mapPointsFromDetectionFrameToVideo(
    [
      { x: 100, y: 80 },
      { x: 572, y: 80 },
      { x: 572, y: 856 },
      { x: 100, y: 856 },
    ],
    672,
    936,
    sourceCrop
  );

  assert.equal(points.length, 4);
  assert.ok(points[0].x < points[1].x);
  assert.ok(points[0].y < points[2].y);
  assert.ok(points[2].x > points[3].x);
});
