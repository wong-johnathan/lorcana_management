export interface OcrRecognizedFields {
  collectorIdentifier: string | null;
  name: string | null;
  subtitle: string | null;
  inkCost: number | null;
  cardType: string | null;
  rawText: string;
}

export interface OcrServiceResponse {
  recognized: OcrRecognizedFields;
  quality: {
    sharpness: number;
    glare: number;
    cardCoverage: number;
    rotation: number;
  };
  lines: Array<{
    text: string;
    confidence: number;
    box: number[][];
  }>;
  engine: string;
  confidence: number;
  processingMs: number;
}

export type OcrServiceErrorCode = "timeout" | "unavailable" | "invalid_response";

export class OcrServiceError extends Error {
  constructor(
    message: string,
    public readonly code: OcrServiceErrorCode,
    public readonly status: number
  ) {
    super(message);
    this.name = "OcrServiceError";
  }
}

interface RequestOcrOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  serviceUrl?: string;
}

function isOcrResponse(value: unknown): value is OcrServiceResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OcrServiceResponse>;
  return Boolean(
    candidate.recognized &&
      typeof candidate.recognized.rawText === "string" &&
      candidate.quality &&
      typeof candidate.quality.rotation === "number" &&
      typeof candidate.engine === "string" &&
      typeof candidate.processingMs === "number"
  );
}

export async function requestOcr(
  image: Buffer,
  mimeType: string,
  options: RequestOcrOptions = {}
): Promise<OcrServiceResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const serviceUrl =
    options.serviceUrl ??
    process.env.OCR_SERVICE_URL ??
    "http://ocr:8000/v1/recognize/lorcana";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(image)], { type: mimeType }),
      "card-image"
    );

    const response = await fetchImpl(serviceUrl, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OcrServiceError(
        `OCR service returned ${response.status}`,
        response.status >= 500 ? "unavailable" : "invalid_response",
        response.status >= 500 ? 503 : 502
      );
    }

    const payload: unknown = await response.json();
    if (!isOcrResponse(payload)) {
      throw new OcrServiceError("OCR service returned an invalid response", "invalid_response", 502);
    }
    return payload;
  } catch (error) {
    if (error instanceof OcrServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OcrServiceError("OCR service timed out", "timeout", 504);
    }
    throw new OcrServiceError("OCR service is unavailable", "unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }
}
