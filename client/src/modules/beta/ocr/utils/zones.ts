// utils/zones.ts
import type { OcrZone } from "../services/types";

/** OCR zones relative to the guide box (ratios 0-1) */
export const OCR_ZONES: OcrZone[] = [
  {
    name: "inkCost",
    x: 0.02,
    y: 0.02,
    width: 0.20,
    height: 0.12,
  },
  {
    name: "cardNumber",
    x: 0.02,
    y: 0.88,
    width: 0.60,
    height: 0.10,
  },
  {
    name: "name",
    x: 0.05,
    y: 0.40,
    width: 0.90,
    height: 0.25,
  },
];

/** Clean OCR output for card number: extract "221/204" from raw text */
export function parseCardNumber(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();

  // Match "XXX/XXX" pattern
  const match = cleaned.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (match) return `${match[1]}/${match[2]}`;

  // Match just "XXX" (single number)
  const numMatch = cleaned.match(/^(\d{1,3})$/);
  if (numMatch) return numMatch[1];

  return null;
}

/** Parse ink cost from OCR text: "6" or "Cost: 6" → 6 */
export function parseInkCost(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "");
  const match = cleaned.match(/(\d+)/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val >= 0 && val <= 15) return val;
  }
  return null;
}
