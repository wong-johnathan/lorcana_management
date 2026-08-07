import { describe, expect, it } from "vitest";
import { getObjectCoverSourceRect } from "../videoFrame";

describe("getObjectCoverSourceRect", () => {
  it("crops landscape camera input to the portrait scanner viewport", () => {
    const rect = getObjectCoverSourceRect(1920, 1080, 480, 640);

    expect(rect.sy).toBe(0);
    expect(rect.sh).toBe(1080);
    expect(rect.sw).toBeCloseTo(810);
    expect(rect.sx).toBeCloseTo(555);
  });

  it("crops portrait camera input vertically for a wider viewport", () => {
    const rect = getObjectCoverSourceRect(1080, 1920, 480, 270);

    expect(rect.sx).toBe(0);
    expect(rect.sw).toBe(1080);
    expect(rect.sh).toBeCloseTo(607.5);
    expect(rect.sy).toBeCloseTo(656.25);
  });

  it("leaves matching aspect ratios uncropped", () => {
    const rect = getObjectCoverSourceRect(900, 1200, 480, 640);

    expect(rect).toEqual({ sx: 0, sy: 0, sw: 900, sh: 1200 });
  });
});
