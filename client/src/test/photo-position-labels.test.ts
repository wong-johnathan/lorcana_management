import { describe, expect, it } from "vitest";
import {
  PHOTO_POSITION_LABELS,
  PHOTO_LABEL_OPTIONS,
  normalizePhotoLabel,
} from "../utils/photoPositionLabels";

describe("photoPositionLabels", () => {
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

  it("appends the explicit Other catch-all to the options list", () => {
    expect(PHOTO_LABEL_OPTIONS).toEqual([...PHOTO_POSITION_LABELS, "Other"]);
    expect(PHOTO_LABEL_OPTIONS).toHaveLength(11);
  });

  it("normalizes canonical labels (positions + Other) case-preserved", () => {
    expect(normalizePhotoLabel("Front")).toBe("Front");
    expect(normalizePhotoLabel("Back Bottom Right")).toBe("Back Bottom Right");
    expect(normalizePhotoLabel("Other")).toBe("Other");
  });

  it("degrades non-canonical, empty, and null values to unlabeled (null)", () => {
    expect(normalizePhotoLabel("Arbitrary")).toBeNull();
    expect(normalizePhotoLabel("")).toBeNull();
    expect(normalizePhotoLabel("   ")).toBeNull();
    expect(normalizePhotoLabel(null)).toBeNull();
    expect(normalizePhotoLabel(undefined)).toBeNull();
  });
});
