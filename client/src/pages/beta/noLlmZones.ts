export type OcrZoneKey = "identifier" | "title" | "typeLine" | "inkCost";

export type OcrZone = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrZoneMap = Record<OcrZoneKey, OcrZone>;

export const DEFAULT_OCR_ZONES: OcrZoneMap = {
  // Bottom-left collector line, e.g. "27/204 • EN • 3".
  identifier: { x: 0.035, y: 0.875, w: 0.48, h: 0.085 },
  // Lorcana character/action names sit in the lower artwork/name plate, not at the top like MTG.
  title: { x: 0.055, y: 0.49, w: 0.68, h: 0.065 },
  typeLine: { x: 0.16, y: 0.585, w: 0.68, h: 0.045 },
  inkCost: { x: 0.025, y: 0.02, w: 0.15, h: 0.12 },
};

export const OCR_ZONE_META: Record<OcrZoneKey, { label: string; shortLabel: string; help: string }> = {
  identifier: {
    label: "Set / card #",
    shortLabel: "#",
    help: "Collector identifier, usually bottom-left: 27/204 • EN • 3",
  },
  title: {
    label: "Name",
    shortLabel: "Name",
    help: "Card name line, e.g. RUSSELL",
  },
  typeLine: {
    label: "Type line",
    shortLabel: "Type",
    help: "Optional consistency hint, e.g. Floodborn • Hero",
  },
  inkCost: {
    label: "Ink cost",
    shortLabel: "Ink",
    help: "Top-left numeric ink-cost bubble. Ink color is selected separately.",
  },
};

const MIN_ZONE_SIZE = 0.025;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeOcrZone(zone: OcrZone): OcrZone {
  const w = Math.min(1, Math.max(MIN_ZONE_SIZE, zone.w));
  const h = Math.min(1, Math.max(MIN_ZONE_SIZE, zone.h));
  const x = Math.min(1 - w, clamp01(zone.x));
  const y = Math.min(1 - h, clamp01(zone.y));
  return { x, y, w, h };
}

export function normalizeOcrZones(value: Partial<Record<OcrZoneKey, Partial<OcrZone>>> | null | undefined): OcrZoneMap {
  return (Object.keys(DEFAULT_OCR_ZONES) as OcrZoneKey[]).reduce((zones, key) => {
    zones[key] = normalizeOcrZone({ ...DEFAULT_OCR_ZONES[key], ...(value?.[key] ?? {}) });
    return zones;
  }, {} as OcrZoneMap);
}

export function moveOcrZone(zone: OcrZone, dx: number, dy: number): OcrZone {
  return normalizeOcrZone({ ...zone, x: zone.x + dx, y: zone.y + dy });
}

export function resizeOcrZone(zone: OcrZone, dw: number, dh: number): OcrZone {
  return normalizeOcrZone({ ...zone, w: zone.w + dw, h: zone.h + dh });
}

export function isPointInOcrZone(zone: OcrZone, x: number, y: number): boolean {
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}
