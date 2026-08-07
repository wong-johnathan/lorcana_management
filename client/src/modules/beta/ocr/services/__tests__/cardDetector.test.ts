import { describe, expect, it } from "vitest";
import { calculateCardAspect } from "../cardDetector";

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
