export function getRectangleShapeAspect(width: number, height: number): number {
  const longSide = Math.max(width, height, 1);
  const shortSide = Math.max(Math.min(width, height), 1);
  return longSide / shortSide;
}

export function isCardShapeAspect(aspectRatio: number): boolean {
  return aspectRatio >= 1.08 && aspectRatio <= 1.9;
}
