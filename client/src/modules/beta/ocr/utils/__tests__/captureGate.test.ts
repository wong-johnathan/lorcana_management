import { describe, expect, it } from "vitest";
import { evaluateCaptureGate, type CaptureGateState } from "../captureGate";

const corners = [
  { x: 0.2, y: 0.1 },
  { x: 0.8, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.9 },
];
const initial: CaptureGateState = { stableFrames: 0, previousCorners: null };

describe("evaluateCaptureGate", () => {
  it("asks for the whole card when no quadrilateral exists", () => {
    const result = evaluateCaptureGate(initial, {
      found: false,
      corners: [],
      coverage: 0,
      sharpness: 0,
      glare: 0,
    });
    expect(result.instruction).toBe("Fit the whole card in the frame");
    expect(result.ready).toBe(false);
  });

  it("rejects glare before accumulating stable frames", () => {
    const result = evaluateCaptureGate(initial, {
      found: true,
      corners,
      coverage: 0.6,
      sharpness: 0.8,
      glare: 0.3,
    });
    expect(result.instruction).toBe("Tilt card to reduce glare");
    expect(result.stableFrames).toBe(0);
  });

  it("becomes ready only after three stable readable frames", () => {
    const detection = {
      found: true,
      corners,
      coverage: 0.6,
      sharpness: 0.8,
      glare: 0.02,
    };
    const first = evaluateCaptureGate(initial, detection);
    const second = evaluateCaptureGate(first, detection);
    const third = evaluateCaptureGate(second, detection);

    expect(first.ready).toBe(false);
    expect(second.ready).toBe(false);
    expect(third.ready).toBe(true);
    expect(third.instruction).toBe("Reading card…");
  });

  it("resets stability when corners move", () => {
    const prior: CaptureGateState = { stableFrames: 2, previousCorners: corners };
    const shifted = corners.map((corner) => ({ x: corner.x + 0.1, y: corner.y }));
    const result = evaluateCaptureGate(prior, {
      found: true,
      corners: shifted,
      coverage: 0.6,
      sharpness: 0.8,
      glare: 0.02,
    });
    expect(result.stableFrames).toBe(1);
    expect(result.ready).toBe(false);
  });
});
