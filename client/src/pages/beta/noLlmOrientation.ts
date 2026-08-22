export type OrientationCandidate = {
  degrees: 0 | 90 | 180 | 270;
  flipX: boolean;
  identifier: string;
};

export type ScoredOrientationCandidate = OrientationCandidate & {
  score: number;
};

function normalizeIdentifierOcr(value: string): string {
  return value
    .replace(/[OoQ]/g, "0")
    .replace(/[IilL|!]/g, "1")
    .replace(/[Bb]/g, "8")
    .replace(/[S]/g, "5")
    .replace(/[·∙●]/g, "•")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreIdentifierOcr(value: string): number {
  const normalized = normalizeIdentifierOcr(value);
  if (!normalized) return 0;

  let score = 0;
  if (/\d{1,3}\s*\/\s*(\d{2,3}|P\d{1,2})/i.test(normalized)) score += 70;
  if (/\bEN\b/i.test(normalized)) score += 15;
  if (/(?:EN\s*)?(?:[•.\- ]+)\s*(\d{1,2}|P\d{1,2})\b/i.test(normalized)) score += 10;
  if (/^[\d\/\sEN•.\-P]+$/i.test(normalized)) score += 5;

  const noisePenalty = Math.min(25, (normalized.match(/[A-Z]{4,}/gi) ?? []).length * 8);
  return Math.max(0, Math.min(100, score - noisePenalty));
}

export function chooseBestOrientation<T extends OrientationCandidate>(candidates: T[]): T & { score: number } {
  if (candidates.length === 0) {
    throw new Error("At least one orientation candidate is required");
  }

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreIdentifierOcr(candidate.identifier) }))
    .sort((a, b) => b.score - a.score)[0];
}
