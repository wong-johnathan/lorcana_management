import { parseCollectorIdentifier } from "./collectorIdentifier.js";

export interface MatchableCard {
  id: string;
  name: string;
  subtitle: string;
  cardNumber: string;
  setCode: string;
  inkCost: number;
  cardType: string;
}

export interface OcrCardEvidence {
  collectorIdentifier?: string | null;
  name?: string | null;
  subtitle?: string | null;
  setCode?: string | null;
  inkCost?: number | null;
  cardType?: string | null;
}

export type MatchDecision = "exact" | "high" | "ambiguous" | "none";

export interface CardMatchCandidate<T extends MatchableCard = MatchableCard> {
  card: T;
  score: number;
  confidence: number;
  reasons: string[];
}

export interface CardMatchResult<T extends MatchableCard = MatchableCard> {
  decision: MatchDecision;
  candidates: CardMatchCandidate<T>[];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

export function stringSimilarity(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined
): number {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);
  if (!left || !right) return 0;
  const longest = Math.max(left.length, right.length);
  return Math.max(0, 1 - levenshtein(left, right) / longest);
}

export function matchCards<T extends MatchableCard>(
  evidence: OcrCardEvidence,
  cards: T[]
): CardMatchResult<T> {
  const recognizedIdentifier = parseCollectorIdentifier(evidence.collectorIdentifier);
  const evidenceSetCode = evidence.setCode?.toUpperCase() ?? recognizedIdentifier?.setCode;

  const scored = cards.map((card): CardMatchCandidate<T> & { exactIdentifier: boolean; nameSimilarity: number } => {
    const reasons: string[] = [];
    let score = 0;
    const cardIdentifier = parseCollectorIdentifier(card.cardNumber);
    const exactIdentifier = Boolean(
      recognizedIdentifier?.isFull &&
        cardIdentifier?.isFull &&
        recognizedIdentifier.normalized === cardIdentifier.normalized
    );

    if (exactIdentifier) {
      score += 100;
      reasons.push("collector_identifier_exact");
    } else if (
      recognizedIdentifier &&
      cardIdentifier &&
      recognizedIdentifier.number === cardIdentifier.number &&
      recognizedIdentifier.denominator === cardIdentifier.denominator
    ) {
      score += 35;
      reasons.push("collector_number_match");

      if (
        recognizedIdentifier.language &&
        cardIdentifier.language === recognizedIdentifier.language
      ) {
        score += 10;
        reasons.push("language_match");
      }
    }

    if (evidenceSetCode && card.setCode.toUpperCase() === evidenceSetCode) {
      score += 20;
      reasons.push("set_code_match");
    }

    const nameSimilarity = stringSimilarity(evidence.name, card.name);
    if (nameSimilarity >= 0.5) {
      score += Math.round(nameSimilarity * 40);
      reasons.push(`name_similarity:${nameSimilarity.toFixed(2)}`);
    }

    const subtitleSimilarity = stringSimilarity(evidence.subtitle, card.subtitle);
    if (subtitleSimilarity >= 0.5) {
      score += Math.round(subtitleSimilarity * 20);
      reasons.push(`subtitle_similarity:${subtitleSimilarity.toFixed(2)}`);
    }

    if (evidence.inkCost != null && evidence.inkCost === card.inkCost) {
      score += 8;
      reasons.push("ink_cost_match");
    }

    if (
      evidence.cardType &&
      normalizeText(evidence.cardType) === normalizeText(card.cardType)
    ) {
      score += 6;
      reasons.push("card_type_match");
    }

    return {
      card,
      score,
      confidence: Math.min(1, score / 120),
      reasons,
      exactIdentifier,
      nameSimilarity,
    };
  });

  const candidates = scored
    .filter((candidate) => candidate.score >= 30)
    .sort((left, right) => right.score - left.score || left.card.id.localeCompare(right.card.id));

  if (candidates.length === 0) return { decision: "none", candidates: [] };

  const top = candidates[0];
  const second = candidates[1];
  const margin = top.score - (second?.score ?? 0);
  const exactCandidates = candidates.filter((candidate) => candidate.exactIdentifier);

  let decision: MatchDecision = "none";
  if (top.exactIdentifier) {
    decision =
      exactCandidates.length === 1 || (top.nameSimilarity >= 0.75 && margin >= 10)
        ? "exact"
        : "ambiguous";
  } else if (top.score >= 70 && margin >= 15) {
    decision = "high";
  } else if (candidates.length > 1 && top.score >= 30) {
    decision = "ambiguous";
  }

  return {
    decision,
    candidates: candidates.slice(0, 3).map(({ card, score, confidence, reasons }) => ({
      card,
      score,
      confidence,
      reasons,
    })),
  };
}
