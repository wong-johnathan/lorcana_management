import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OCR_ZONES,
  isPointInOcrZone,
  moveOcrZone,
  normalizeOcrZone,
  normalizeOcrZones,
  resizeOcrZone,
} from "../src/pages/beta/noLlmZones";

test("normalizeOcrZones merges persisted partial zones with defaults", () => {
  const zones = normalizeOcrZones({ title: { x: 0.2 } });

  assert.equal(zones.title.x, 0.2);
  assert.equal(zones.title.y, DEFAULT_OCR_ZONES.title.y);
  assert.deepEqual(zones.identifier, DEFAULT_OCR_ZONES.identifier);
});

test("normalizeOcrZone clamps zones inside the captured crop", () => {
  assert.deepEqual(normalizeOcrZone({ x: 0.99, y: -1, w: 0.2, h: 0.2 }), {
    x: 0.8,
    y: 0,
    w: 0.2,
    h: 0.2,
  });
});

test("moveOcrZone and resizeOcrZone keep editable OCR boxes valid", () => {
  const moved = moveOcrZone({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.8, 0.8);
  assert.deepEqual(moved, { x: 0.8, y: 0.8, w: 0.2, h: 0.2 });

  const resized = resizeOcrZone({ x: 0.9, y: 0.9, w: 0.08, h: 0.08 }, 0.2, 0.2);
  assert.equal(resized.x + resized.w <= 1, true);
  assert.equal(resized.y + resized.h <= 1, true);
});

test("isPointInOcrZone detects pointer hits in normalized crop coordinates", () => {
  const zone = { x: 0.2, y: 0.3, w: 0.4, h: 0.2 };

  assert.equal(isPointInOcrZone(zone, 0.4, 0.4), true);
  assert.equal(isPointInOcrZone(zone, 0.1, 0.4), false);
});
