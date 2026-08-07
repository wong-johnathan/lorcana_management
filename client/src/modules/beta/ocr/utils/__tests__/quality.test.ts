import { describe, expect, it } from "vitest";
import { calculateFrameQuality } from "../quality";

function pixels(width: number, height: number, valueAt: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = valueAt(x, y);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("calculateFrameQuality", () => {
  it("scores a flat frame as blurry", () => {
    expect(calculateFrameQuality(pixels(8, 8, () => 100)).sharpness).toBe(0);
  });

  it("scores high-frequency detail above a flat frame", () => {
    const quality = calculateFrameQuality(
      pixels(8, 8, (x, y) => ((x + y) % 2 ? 255 : 0))
    );
    expect(quality.sharpness).toBeGreaterThan(0.5);
  });

  it("reports clipped white pixels as glare", () => {
    expect(calculateFrameQuality(pixels(8, 8, () => 255)).glare).toBe(1);
  });
});
