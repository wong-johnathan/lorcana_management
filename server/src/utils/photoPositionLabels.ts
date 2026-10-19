/**
 * Canonical photo position labels (REQ-POL-15, Johnathan's exact order).
 * `PHOTO_LABEL_OPTIONS` adds the explicit "Other" catch-all; empty/null means
 * "unlabeled" (the untouched default, distinct from an explicit "Other").
 * Mirrored on the client in `client/src/utils/photoPositionLabels.ts`.
 */
export const PHOTO_POSITION_LABELS: readonly string[] = [
  "Front",
  "Front Top Left",
  "Front Top Right",
  "Front Bottom Left",
  "Front Bottom Right",
  "Back",
  "Back Top Left",
  "Back Top Right",
  "Back Bottom Left",
  "Back Bottom Right",
];

export const PHOTO_LABEL_OPTIONS: readonly string[] = [
  ...PHOTO_POSITION_LABELS,
  "Other",
];

/**
 * Lenient normalization: return `value` iff it is one of the 10 positions or
 * "Other"; everything else (including non-strings and absent values) is null.
 */
export function normalizePhotoLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return PHOTO_LABEL_OPTIONS.includes(value) ? value : null;
}
