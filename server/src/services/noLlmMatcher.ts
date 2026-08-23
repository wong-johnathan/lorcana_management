import type { Card } from "@prisma/client";

export interface NoLlmOcrInput {
  fullIdentifier?: string;
  collectorNumber?: string;
  setCode?: string;
  name?: string;
  subtitle?: string;
  typeLine?: string;
  inkCost?: string | number;
  color?: string;
  rawText?: Record<string, string>;
}

export interface NoLlmRecognizedCard {
  fullIdentifier: string;
  collectorNumber: string;
  setCode: string;
  name: string;
  subtitle: string;
  typeLine: string;
  inkCost: string;
  color: string;
  rawText: Record<string, string>;
}

export interface NoLlmMatch<TCard = Card> {
  card: TCard;
  score: number;
  reasons: string[];
}

interface ParsedIdentifier {
  fullIdentifier: string;
  collectorNumber: string;
  setCode: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOcrText(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeWhitespace(
    value
      .replace(/[“”]/g, '"')
      .replace(/[’‘]/g, "'")
      .replace(/[·∙●]/g, "•")
      .replace(/[–—]/g, "-")
  );
}

function normalizeNumericToken(value: string): string {
  return value
    .replace(/[OoQ]/g, "0")
    .replace(/[IilL|!]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

export function parseCollectorIdentifier(raw: string): ParsedIdentifier | null {
  const normalized = normalizeOcrText(raw)
    .replace(/[·∙●]/g, "•")
    .replace(/\s*[•.-]\s*/g, " • ");

  const match = normalized.match(
    /([0-9OoQIl|!SBl]{1,3})\s*\/\s*([0-9OoQIl|!SBl]{2,3}|P\s*[0-9OoQIl|!SBl]{1,2})\s*(?:•\s*)?(?:EN)?\s*(?:•\s*)?([0-9OoQIl|!SBl]{1,2}|P\s*[0-9OoQIl|!SBl]{1,2})?/i
  );

  if (!match) return null;

  const number = normalizeNumericToken(match[1]);
  const denominator = normalizeNumericToken(match[2].replace(/\s+/g, "").toUpperCase());
  const setCode = match[3] ? normalizeNumericToken(match[3].replace(/\s+/g, "").toUpperCase()) : "";
  const collectorNumber = `${number}/${denominator}`;
  const fullIdentifier = setCode ? `${collectorNumber} • EN • ${setCode}` : collectorNumber;

  return { fullIdentifier, collectorNumber, setCode };
}

export function buildRecognizedOcr(input: NoLlmOcrInput): NoLlmRecognizedCard {
  const rawText = input.rawText ?? {};
  const rawIdentifier = input.fullIdentifier || input.collectorNumber || rawText.identifier || "";
  const parsed = parseCollectorIdentifier(rawIdentifier);

  return {
    fullIdentifier: normalizeOcrText(input.fullIdentifier || parsed?.fullIdentifier || ""),
    collectorNumber: normalizeOcrText(input.collectorNumber || parsed?.collectorNumber || ""),
    setCode: normalizeOcrText(input.setCode || parsed?.setCode || ""),
    name: normalizeOcrText(input.name || rawText.title || ""),
    subtitle: normalizeOcrText(input.subtitle || rawText.subtitle || ""),
    typeLine: normalizeOcrText(input.typeLine || rawText.typeLine || ""),
    inkCost: normalizeOcrText(String(input.inkCost ?? rawText.inkCost ?? "")),
    color: normalizeOcrText(input.color || rawText.inkColor || rawText.color || ""),
    rawText,
  };
}

function comparable(value: string): string {
  return normalizeOcrText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function fuzzyTextScore(ocrText: string, cardText: string): number {
  const a = comparable(ocrText);
  const b = comparable(cardText);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 4 && (a.includes(b) || b.includes(a))) return 0.82;
  const maxLength = Math.max(a.length, b.length);
  const ratio = 1 - levenshtein(a, b) / maxLength;
  return ratio >= 0.68 ? ratio : 0;
}

export function parseInkCost(raw: string): number | null {
  const normalized = normalizeNumericToken(normalizeOcrText(raw));
  const match = normalized.match(/\b([0-9])\b/);
  return match ? Number(match[1]) : null;
}

export function scoreNoLlmCardMatch<TCard extends Pick<Card, "cardNumber" | "setCode" | "name" | "subtitle" | "cardType" | "types" | "inkCost" | "color">>(
  card: TCard,
  ocr: NoLlmRecognizedCard
): NoLlmMatch<TCard> {
  let score = 0;
  const reasons: string[] = [];
  const cardNumber = normalizeOcrText(card.cardNumber);
  const cardShortNumber = cardNumber.split("•")[0]?.trim() || cardNumber;

  if (ocr.fullIdentifier && comparable(cardNumber) === comparable(ocr.fullIdentifier)) {
    score += 100;
    reasons.push("Exact full identifier match");
  } else if (ocr.fullIdentifier && comparable(cardNumber).includes(comparable(ocr.fullIdentifier))) {
    score += 88;
    reasons.push("Normalized full identifier match");
  }

  if (ocr.collectorNumber && comparable(cardShortNumber) === comparable(ocr.collectorNumber)) {
    score += 35;
    reasons.push("Collector number match");
  }

  if (ocr.setCode && card.setCode && comparable(card.setCode) === comparable(ocr.setCode)) {
    score += 25;
    reasons.push("Set code match");
  }

  const nameScore = fuzzyTextScore(ocr.name, card.name);
  if (nameScore > 0) {
    score += Math.round(30 * nameScore);
    reasons.push(nameScore === 1 ? "Exact name match" : "Fuzzy name match");
  }

  const subtitleScore = fuzzyTextScore(ocr.subtitle, card.subtitle || "");
  if (subtitleScore > 0) {
    score += Math.round(22 * subtitleScore);
    reasons.push(subtitleScore === 1 ? "Exact subtitle match" : "Fuzzy subtitle match");
  }

  const typeLine = comparable(ocr.typeLine);
  if (typeLine) {
    if (card.cardType && typeLine.includes(comparable(card.cardType))) {
      score += 5;
      reasons.push("Card type appears in OCR text");
    }
    const matchedSubtype = card.types.find((type) => typeLine.includes(comparable(type)));
    if (matchedSubtype) {
      score += 5;
      reasons.push("Subtype appears in OCR text");
    }
  }

  const parsedInkCost = parseInkCost(ocr.inkCost);
  if (parsedInkCost != null && parsedInkCost === card.inkCost) {
    score += 8;
    reasons.push("Ink cost hint matches");
  }

  if (ocr.color && card.color && comparable(card.color) === comparable(ocr.color)) {
    score += 10;
    reasons.push("Ink color hint matches");
  }

  return { card, score, reasons };
}

export function rankNoLlmMatches<TCard extends Pick<Card, "cardNumber" | "setCode" | "name" | "subtitle" | "cardType" | "types" | "inkCost" | "color">>(
  cards: TCard[],
  ocr: NoLlmRecognizedCard
): NoLlmMatch<TCard>[] {
  return cards
    .map((card) => scoreNoLlmCardMatch(card, ocr))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
