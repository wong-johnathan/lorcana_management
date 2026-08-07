import { describe, expect, it } from "vitest";
import { calculateCardAspect, guideCornersForImage } from "../cardDetector";

const portraitCardInPortraitFrame = [
  { x: 80 / 480, y: 80 / 640 },
  { x: 400 / 480, y: 80 / 640 },
  { x: 400 / 480, y: 560 / 640 },
  { x: 80 / 480, y: 560 / 640 },
];

const landscapeCardInPortraitFrame = [
  { x: 40 / 480, y: 160 / 640 },
  { x: 440 / 480, y: 160 / 640 },
  { x: 440 / 480, y: 427 / 640 },
  { x: 40 / 480, y: 427 / 640 },
];

describe("calculateCardAspect", () => {
  it("uses pixel-space geometry for portrait mobile frames", () => {
    expect(calculateCardAspect(portraitCardInPortraitFrame, 480, 640)).toBeCloseTo(2 / 3, 2);
  });

  it("keeps sideways location cards in the landscape card range", () => {
    expect(calculateCardAspect(landscapeCardInPortraitFrame, 480, 640)).toBeCloseTo(1.5, 1);
  });
});

describe("guideCornersForImage", () => {
  it("matches the scanner guide aspect ratio in a portrait frame", () => {
    const corners = guideCornersForImage(480, 640);

    expect(calculateCardAspect(corners, 480, 640)).toBeCloseTo(2 / 3, 2);
    expect(corners[0].y).toBeCloseTo(0.09);
    expect(corners[2].y).toBeCloseTo(0.91);
  });
});
