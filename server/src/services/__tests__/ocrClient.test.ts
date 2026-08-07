import { describe, expect, it, vi } from "vitest";
import {
  requestOcr,
  type OcrServiceResponse,
} from "../ocrClient.js";

const response: OcrServiceResponse = {
  recognized: {
    collectorIdentifier: "32/204 • EN • 3",
    name: null,
    subtitle: null,
    inkCost: null,
    cardType: null,
    rawText: "Never Land\n32/204 • EN • 3",
  },
  quality: { sharpness: 0.8, glare: 0.02, cardCoverage: 1, rotation: 90 },
  lines: [],
  engine: "fake",
  confidence: 0.9,
  processingMs: 120,
};

describe("requestOcr", () => {
  it("posts the image to the private sidecar as multipart data", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.body as FormData).get("image")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      requestOcr(Buffer.from("jpeg"), "image/jpeg", { fetchImpl, timeoutMs: 100 })
    ).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps unavailable sidecars to a typed service error", async () => {
    const fetchImpl = vi.fn(async () => new Response("offline", { status: 503 }));

    await expect(
      requestOcr(Buffer.from("jpeg"), "image/jpeg", { fetchImpl, timeoutMs: 100 })
    ).rejects.toMatchObject({ code: "unavailable", status: 503 });
  });

  it("maps abort failures to a timeout error", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(
      requestOcr(Buffer.from("jpeg"), "image/jpeg", { fetchImpl, timeoutMs: 1 })
    ).rejects.toMatchObject({ code: "timeout", status: 504 });
  });
});
