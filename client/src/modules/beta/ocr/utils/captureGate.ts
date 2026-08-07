export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface CardDetection {
  found: boolean;
  corners: NormalizedPoint[];
  coverage: number;
  sharpness: number;
  glare: number;
  source?: "contour" | "guide" | "none";
  contourCount?: number;
  edgeDensity?: number;
}

export interface CaptureGateState {
  stableFrames: number;
  previousCorners: NormalizedPoint[] | null;
}

export interface CaptureGateResult extends CaptureGateState {
  ready: boolean;
  instruction: string;
}

const MAX_CORNER_MOVEMENT = 0.025;

function cornerMovement(
  previous: NormalizedPoint[] | null,
  current: NormalizedPoint[]
): number {
  if (!previous || previous.length !== 4 || current.length !== 4) return Number.POSITIVE_INFINITY;
  return (
    current.reduce((sum, point, index) => {
      const before = previous[index];
      return sum + Math.hypot(point.x - before.x, point.y - before.y);
    }, 0) / 4
  );
}

export function evaluateCaptureGate(
  state: CaptureGateState,
  detection: CardDetection
): CaptureGateResult {
  const reset = (instruction: string): CaptureGateResult => ({
    stableFrames: 0,
    previousCorners: detection.corners.length === 4 ? detection.corners : null,
    ready: false,
    instruction,
  });

  if (!detection.found || detection.corners.length !== 4) {
    return reset("Fit the whole card in the frame");
  }
  if (detection.coverage < 0.2) return reset("Move closer");
  if (detection.coverage > 0.9) return reset("Move farther away");
  if (detection.glare > 0.15) return reset("Tilt card to reduce glare");
  if (detection.sharpness < 0.08) return reset("Hold steady");

  const stable = cornerMovement(state.previousCorners, detection.corners) <= MAX_CORNER_MOVEMENT;
  const stableFrames = stable ? state.stableFrames + 1 : 1;
  const ready = stableFrames >= 3;
  return {
    stableFrames,
    previousCorners: detection.corners,
    ready,
    instruction: ready ? "Reading card…" : "Hold steady",
  };
}
