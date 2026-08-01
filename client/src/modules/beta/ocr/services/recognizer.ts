// services/recognizer.ts
import type { Recognizer } from "./types";
import { TesseractCardRecognizer } from "./tesseractRecognizer";

let instance: Recognizer | null = null;

export function getRecognizer(): Recognizer {
  if (!instance) {
    instance = new TesseractCardRecognizer();
  }
  return instance;
}
