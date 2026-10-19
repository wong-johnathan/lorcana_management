/**
 * Photo position labels (REQ-POL-15). Canonical ordered list mirrored on the
 * server (`server/src/utils/photoPositionLabels.ts`) and the client; both
 * copies must match Johnathan's exact order. Empty/null means unlabeled.
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
] as const;

/** The 10 positions plus the explicit "Other" catch-all (distinct from unlabeled). */
export const PHOTO_LABEL_OPTIONS: readonly string[] = [
  ...PHOTO_POSITION_LABELS,
  "Other",
] as const;

const PHOTO_LABEL_SET = new Set<string>(PHOTO_LABEL_OPTIONS);

/**
 * Lenient normalization: returns the value iff it is one of the 10 positions or
 * "Other", otherwise null (unlabeled). Mirrors the server's lenient validation
 * (non-canonical values degrade to unlabeled rather than erroring).
 */
export function normalizePhotoLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return PHOTO_LABEL_SET.has(trimmed) ? trimmed : null;
}
