// workers/ocr.worker.ts
import { createWorker, type Worker } from "tesseract.js";

let worker: Worker | null = null;

interface OcrRequest {
  id: string;
  zones: Array<{ name: string; imageDataUrl: string }>;
}

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          self.postMessage({
            type: "progress",
            progress: m.progress,
            id: (self as any).__currentId,
          });
        }
      },
    });
  }
  return worker;
}

self.onmessage = async (e: MessageEvent<OcrRequest>) => {
  const { id, zones } = e.data;
  (self as any).__currentId = id;

  try {
    const w = await getWorker();
    const results: Record<string, string> = {};

    for (const zone of zones) {
      const {
        data: { text },
      } = await w.recognize(zone.imageDataUrl);
      results[zone.name] = text.trim();
    }

    self.postMessage({ type: "result", id, results });
  } catch (error: any) {
    self.postMessage({ type: "error", id, error: error.message });
  }
};
