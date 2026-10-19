import { describe, expect, it } from "vitest";
import {
  PHOTO_LABEL_OPTIONS,
  PHOTO_POSITION_LABELS,
  normalizePhotoLabel,
} from "../src/utils/photoPositionLabels.js";

describe("PHOTO_POSITION_LABELS (REQ-POL-15)", () => {
  it("matches Johnathan's exact 10-position order", () => {
    expect(PHOTO_POSITION_LABELS).toEqual([
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
    ]);
  });

  it("PHOTO_LABEL_OPTIONS is the 10 positions plus 'Other'", () => {
    expect(PHOTO_LABEL_OPTIONS).toEqual([
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
      "Other",
    ]);
  });
});

describe("normalizePhotoLabel", () => {
  it.each([
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
    "Other",
  ])("returns the canonical value %s unchanged", (label) => {
    expect(normalizePhotoLabel(label)).toBe(label);
  });

  it("returns null for non-canonical strings", () => {
    expect(normalizePhotoLabel("Front Side")).toBeNull();
    expect(normalizePhotoLabel("front")).toBeNull();
    expect(normalizePhotoLabel("")).toBeNull();
    expect(normalizePhotoLabel("Anything")).toBeNull();
  });

  it("returns null for non-string and absent values", () => {
    expect(normalizePhotoLabel(undefined)).toBeNull();
    expect(normalizePhotoLabel(null)).toBeNull();
    expect(normalizePhotoLabel(42)).toBeNull();
    expect(normalizePhotoLabel({ label: "Front" })).toBeNull();
  });
});
