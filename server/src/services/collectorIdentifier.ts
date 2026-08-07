export interface ParsedCollectorIdentifier {
  number: string;
  denominator: string;
  language: string | null;
  setCode: string | null;
  normalized: string;
  isFull: boolean;
}

const IDENTIFIER_PATTERN =
  /([0-9OIL|]{1,4})\s*[\/|]\s*([A-Z0-9OIL|]{1,4})(?:\s*[•·.\-–—]\s*([A-Z]{2}))?(?:\s*[•·.\-–—]\s*([A-Z0-9]{1,4}))?/i;

function normalizeDigits(value: string, stripLeadingZeros: boolean): string {
  const normalized = value
    .toUpperCase()
    .replace(/[O]/g, "0")
    .replace(/[IL|]/g, "1");

  if (!/^\d+$/.test(normalized)) return normalized;
  if (!stripLeadingZeros) return normalized;
  return String(Number.parseInt(normalized, 10));
}

function normalizeDenominator(value: string): string {
  const upper = value.toUpperCase();
  return /^[0-9OIL|]+$/.test(upper)
    ? normalizeDigits(upper, true)
    : upper;
}

function normalizeSetCode(value: string): string {
  const upper = value.toUpperCase();
  return /^[0-9OIL|]+$/.test(upper)
    ? normalizeDigits(upper, false)
    : upper;
}

export function parseCollectorIdentifier(
  raw: string | null | undefined
): ParsedCollectorIdentifier | null {
  if (!raw?.trim()) return null;

  const match = raw.toUpperCase().match(IDENTIFIER_PATTERN);
  if (!match) return null;

  const number = normalizeDigits(match[1], true);
  const denominator = normalizeDenominator(match[2]);
  if (!/^\d{1,3}$/.test(number) || !/^[A-Z0-9]{1,4}$/.test(denominator)) {
    return null;
  }

  const language = match[3]?.toUpperCase() ?? null;
  const setCode = match[4] ? normalizeSetCode(match[4]) : null;
  const parts = [`${number}/${denominator}`];
  if (language) parts.push(language);
  if (setCode) parts.push(setCode);

  return {
    number,
    denominator,
    language,
    setCode,
    normalized: parts.join(" • "),
    isFull: Boolean(language && setCode),
  };
}

export function normalizeCollectorIdentifier(
  raw: string | null | undefined
): string | null {
  return parseCollectorIdentifier(raw)?.normalized ?? null;
}
