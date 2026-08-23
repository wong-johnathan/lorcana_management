export type OrientationCandidate = {
  degrees: 0 | 90 | 180 | 270;
  flipX: boolean;
  identifier: string;
  title?: string;
  typeLine?: string;
};

export type ScoredOrientationCandidate = OrientationCandidate & {
  score: number;
};

export type ManualOrientation = {
  degrees: 0 | 90 | 180 | 270;
  flipX: boolean;
  flipY: boolean;
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

const COMMON_CARD_WORDS = new Set([
  "A",
  "AN",
  "AND",
  "ARE",
  "BE",
  "CARD",
  "CHARACTER",
  "DIDN",
  "DIDNT",
  "DREAMBORN",
  "EXERT",
  "HAVE",
  "IF",
  "I",
  "INK",
  "ITEM",
  "LORE",
  "OF",
  "PLAY",
  "PLAYER",
  "QUEST",
  "SONGBORN",
  "SONG",
  "THE",
  "TO",
  "YOU",
  "YOUR",
]);

export function scoreReadableTextOcr(value: string): number {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[A-Z]/.test(normalized)) return 0;

  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  const tokens = normalized.split(" ").filter(Boolean);
  const alphaCount = (compact.match(/[A-Z]/g) ?? []).length;
  const commonHits = tokens.filter((token) => COMMON_CARD_WORDS.has(token.replace(/'/g, ""))).length;
  const vowelPoorTokens = tokens.filter((token) => token.length >= 4 && !/[AEIOUY]/.test(token)).length;

  let score = 0;
  if (compact.length >= 4 && compact.length <= 60) score += 10;
  if (alphaCount / Math.max(compact.length, 1) > 0.65) score += 10;
  if (tokens.length >= 2) score += 15;
  if (/[AEIOUY]/.test(normalized)) score += 10;
  score += Math.min(50, commonHits * 15);
  score -= Math.min(25, vowelPoorTokens * 8);

  return Math.max(0, Math.min(100, score));
}

export function scoreOrientationCandidate(candidate: OrientationCandidate): number {
  const identifierScore = scoreIdentifierOcr(candidate.identifier);
  if (identifierScore >= 70) return identifierScore;

  const titleScore = candidate.title ? scoreReadableTextOcr(candidate.title) : 0;
  const typeScore = candidate.typeLine ? scoreReadableTextOcr(candidate.typeLine) : 0;
  return Math.max(identifierScore, Math.min(100, titleScore + Math.min(20, typeScore * 0.35)));
}

export function formatManualOrientation(orientation: ManualOrientation): string {
  return [
    `${orientation.degrees}°`,
    orientation.flipX ? "flip H" : "",
    orientation.flipY ? "flip V" : "",
  ]
    .filter(Boolean)
    .join(" + ");
}

export function rotateManualOrientation(orientation: ManualOrientation, delta: 90 | -90): ManualOrientation {
  const degrees = ((((orientation.degrees + delta) % 360) + 360) % 360) as ManualOrientation["degrees"];
  return { ...orientation, degrees };
}

export function toggleManualFlipX(orientation: ManualOrientation): ManualOrientation {
  return { ...orientation, flipX: !orientation.flipX };
}

export function toggleManualFlipY(orientation: ManualOrientation): ManualOrientation {
  return { ...orientation, flipY: !orientation.flipY };
}

export function chooseBestOrientation<T extends OrientationCandidate>(candidates: T[]): T & { score: number } {
  if (candidates.length === 0) {
    throw new Error("At least one orientation candidate is required");
  }

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreOrientationCandidate(candidate) }))
    .sort((a, b) => b.score - a.score)[0];
}
