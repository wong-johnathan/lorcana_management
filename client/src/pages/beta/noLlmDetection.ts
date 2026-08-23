const TARGET_TCG_ASPECT = 88 / 63;
const MIN_WHOLE_CARD_AREA_RATIO = 0.055;

export type CardCandidateScoreInput = {
  aspectRatio: number;
  fillRatio: number;
  areaRatio: number;
  centerOffset: number;
  sourceWeight?: number;
};

export type NormalizedRoi = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SharpnessImageData = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export function getRectangleShapeAspect(width: number, height: number): number {
  const longSide = Math.max(width, height, 1);
  const shortSide = Math.max(Math.min(width, height), 1);
  return longSide / shortSide;
}

export function estimateImageSharpness(imageData: SharpnessImageData, roi: NormalizedRoi = { x: 0, y: 0, w: 1, h: 1 }): number {
  const x0 = Math.max(1, Math.floor(imageData.width * roi.x));
  const y0 = Math.max(1, Math.floor(imageData.height * roi.y));
  const x1 = Math.min(imageData.width - 2, Math.ceil(imageData.width * (roi.x + roi.w)));
  const y1 = Math.min(imageData.height - 2, Math.ceil(imageData.height * (roi.y + roi.h)));
  const values: number[] = [];

  const grayAt = (x: number, y: number) => {
    const offset = (y * imageData.width + x) * 4;
    return imageData.data[offset] * 0.299 + imageData.data[offset + 1] * 0.587 + imageData.data[offset + 2] * 0.114;
  };

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const center = grayAt(x, y) * 4;
      const laplacian = center - grayAt(x - 1, y) - grayAt(x + 1, y) - grayAt(x, y - 1) - grayAt(x, y + 1);
      values.push(laplacian);
    }
  }

  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

export function isCardShapeAspect(aspectRatio: number): boolean {
  return aspectRatio >= 1.08 && aspectRatio <= 1.9;
}

function similarityScore(value: number, target: number, tolerance: number): number {
  return Math.max(0, 1 - Math.abs(value - target) / tolerance);
}

export function scoreCardCandidate({
  aspectRatio,
  fillRatio,
  areaRatio,
  centerOffset,
  sourceWeight = 1,
}: CardCandidateScoreInput): number {
  if (!isCardShapeAspect(aspectRatio)) return 0;
  if (areaRatio < MIN_WHOLE_CARD_AREA_RATIO || areaRatio > 0.92) return 0;
  if (fillRatio < 0.18 || fillRatio > 1.15) return 0;

  const aspectScore = similarityScore(aspectRatio, TARGET_TCG_ASPECT, 0.5);
  const fillScore = similarityScore(fillRatio, 0.72, 0.55);
  // Internal artwork/name boxes can be perfectly centered and card-shaped. Bias strongly toward
  // candidates large enough to be the whole physical card, not a rectangle inside the art.
  const areaScore = Math.min(1, areaRatio / 0.26);
  const wholeCardSizeBias = areaRatio < 0.1 ? 0.3 : areaRatio < 0.16 ? 0.68 : 1;
  const centerScore = Math.max(0, 1 - centerOffset);

  return (
    (areaScore * 0.38 + aspectScore * 0.27 + fillScore * 0.13 + centerScore * 0.22) *
    wholeCardSizeBias *
    sourceWeight
  );
}
