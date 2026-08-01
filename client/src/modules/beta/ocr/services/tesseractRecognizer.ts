// services/tesseractRecognizer.ts
import type { Recognizer, RecognizeResult, OcrZone } from "./types";
import { extractZoneForOcr } from "../utils/preprocess";
import { parseCardNumber, parseInkCost } from "../utils/zones";

const workerUrl = new URL("../workers/ocr.worker.ts", import.meta.url);

export class TesseractCardRecognizer implements Recognizer {
  readonly name = "Tesseract.js";

  private worker: Worker;
  private pending: Map<string, { resolve: (v: Record<string, string>) => void; reject: (e: Error) => void }> = new Map();

  constructor() {
    this.worker = new Worker(workerUrl, { type: "module" });
    this.worker.onmessage = (e) => {
      const { type, id, results, error } = e.data;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);

      if (type === "result") {
        pending.resolve(results);
      } else if (type === "error") {
        pending.reject(new Error(error));
      }
    };
  }

  async recognize(imageData: ImageData, zones: OcrZone[]): Promise<RecognizeResult> {
    const id = crypto.randomUUID();

    // Extract each zone as a preprocessed data URL
    const zoneRequests = await Promise.all(
      zones.map(async (zone) => ({
        name: zone.name,
        imageDataUrl: await extractZoneForOcr(
          imageData, zone.x, zone.y, zone.width, zone.height
        ),
      }))
    );

    // Send to worker
    const rawText: Record<string, string> = await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, zones: zoneRequests });
    });

    // Parse structured results
    const cardNumber = parseCardNumber(rawText.cardNumber || "");
    const inkCost = parseInkCost(rawText.inkCost || "");
    const name = (rawText.name || "").replace(/\n/g, " ").trim() || null;

    // Confidence heuristic
    let confidence = 0;
    if (cardNumber) confidence += 0.5;
    if (name) confidence += 0.3;
    if (inkCost !== null) confidence += 0.2;

    return { cardNumber, name, inkCost, confidence, rawText };
  }

  destroy() {
    this.worker.terminate();
  }
}
