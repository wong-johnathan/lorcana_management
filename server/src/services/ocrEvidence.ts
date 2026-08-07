import type { OcrCardEvidence } from "./cardMatcher.js";

interface OcrTextFields {
  collectorIdentifier: string | null;
  rawText: string;
  name?: string | null;
  subtitle?: string | null;
  inkCost?: number | null;
  cardType?: string | null;
}

interface EvidenceCard {
  name: string;
  subtitle: string;
  cardType: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return phrase.length >= 3 && ` ${haystack} `.includes(` ${phrase} `);
}

export function extractOcrEvidence(
  recognized: OcrTextFields,
  cards: EvidenceCard[]
): OcrCardEvidence {
  const text = normalize(recognized.rawText);
  const directName = recognized.name?.trim() || undefined;
  const matchedCard = cards
    .filter((card) => containsPhrase(text, normalize(card.name)))
    .sort((left, right) => right.name.length - left.name.length)[0];

  const name = directName ?? matchedCard?.name;
  const subtitle =
    recognized.subtitle?.trim() ||
    (matchedCard && containsPhrase(text, normalize(matchedCard.subtitle))
      ? matchedCard.subtitle
      : undefined);

  const knownTypes = ["Character", "Action", "Item", "Location"];
  const detectedType = knownTypes.find((type) =>
    containsPhrase(text, normalize(type))
  );

  return {
    collectorIdentifier: recognized.collectorIdentifier,
    name,
    subtitle,
    inkCost: recognized.inkCost,
    cardType: recognized.cardType?.trim() || detectedType,
  };
}
