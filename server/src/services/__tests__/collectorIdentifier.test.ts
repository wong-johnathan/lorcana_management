import { describe, expect, it } from "vitest";
import {
  normalizeCollectorIdentifier,
  parseCollectorIdentifier,
} from "../collectorIdentifier.js";

describe("parseCollectorIdentifier", () => {
  it("parses a full standard collector identifier", () => {
    expect(parseCollectorIdentifier("32/204 • EN • 3")).toEqual({
      number: "32",
      denominator: "204",
      language: "EN",
      setCode: "3",
      normalized: "32/204 • EN • 3",
      isFull: true,
    });
  });

  it("parses alphanumeric promo denominators", () => {
    expect(parseCollectorIdentifier("26/P2 • EN • 7")).toEqual({
      number: "26",
      denominator: "P2",
      language: "EN",
      setCode: "7",
      normalized: "26/P2 • EN • 7",
      isFull: true,
    });
  });

  it("normalizes OCR punctuation, spacing, and digit substitutions", () => {
    expect(normalizeCollectorIdentifier(" O1 / 2O4 - en - O3 ")).toBe(
      "1/204 • EN • 03"
    );
  });

  it("keeps a short identifier explicitly incomplete", () => {
    expect(parseCollectorIdentifier("1/204")).toEqual({
      number: "1",
      denominator: "204",
      language: null,
      setCode: null,
      normalized: "1/204",
      isFull: false,
    });
  });

  it("rejects a bare numeric value", () => {
    expect(parseCollectorIdentifier("1")).toBeNull();
  });

  it("does not mutate letters in non-numeric fields", () => {
    expect(parseCollectorIdentifier("26/P2 • EN • C1")?.setCode).toBe("C1");
  });
});
