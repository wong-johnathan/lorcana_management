const TARGET_TCG_ASPECT = 88 / 63;
const MIN_WHOLE_CARD_AREA_RATIO = 0.055;

export type CardCandidateScoreInput = {
  aspectRatio: number;
  fillRatio: number;
  areaRatio: number;
  centerOffset: number;
  sourceWeight?: number;
};

export function getRectangleShapeAspect(width: number, height: number): number {
  const longSide = Math.max(width, height, 1);
  const shortSide = Math.max(Math.min(width, height), 1);
  return longSide / shortSide;
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
