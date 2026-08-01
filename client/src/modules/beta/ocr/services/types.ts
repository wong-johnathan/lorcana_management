// services/types.ts

export interface OcrZone {
  name: string;
  x: number;       // ratio 0-1 relative to guide box width
  y: number;       // ratio 0-1 relative to guide box height
  width: number;   // ratio 0-1
  height: number;  // ratio 0-1
}

export interface RecognizeResult {
  cardNumber: string | null;
  name: string | null;
  inkCost: number | null;
  confidence: number;
  rawText: Record<string, string>;
}

export interface Recognizer {
  readonly name: string;
  recognize(imageData: ImageData, zones: OcrZone[]): Promise<RecognizeResult>;
}

export interface ScanEntry {
  cardId: string;
  name: string;
  subtitle: string;
  imageUrl: string;
  color: string;
  inkCost: number;
  cardNumber: string;
  setName: string;
  rarity: string;
  cardType: string;
  finish: "Normal" | "Cold Foil" | "Enchanted";
  quantity: number;
  scannedAt: number;
}

export interface ScanSession {
  setCode: string;
  setName: string;
  language: string;
  defaultFinish: "Normal" | "Cold Foil" | "Enchanted";
  entries: ScanEntry[];
}

export type ScanStatus =
  | { phase: "waiting" }
  | { phase: "stabilizing" }
  | { phase: "recognizing" }
  | { phase: "result"; entry: ScanEntry }
  | { phase: "duplicate"; existing: ScanEntry; newFinish: string }
  | { phase: "no_match" }
  | { phase: "error"; message: string };
