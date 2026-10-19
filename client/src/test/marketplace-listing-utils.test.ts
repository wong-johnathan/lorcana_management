import { describe, expect, it, vi } from "vitest";
import {
  MAX_LISTING_PHOTO_COUNT,
  MAX_LISTING_PHOTO_BYTES,
  ALLOWED_LISTING_PHOTO_MIME_TYPES,
  validateListingPhoto,
  readFileAsDataUrl,
  ownedCountForVariant,
  keepCountForVariant,
  surplusForVariant,
} from "../utils/marketplaceListing";

describe("marketplaceListing utils", () => {
  it("exposes the photo limit constants", () => {
    expect(MAX_LISTING_PHOTO_COUNT).toBe(8);
    expect(MAX_LISTING_PHOTO_BYTES).toBe(5 * 1024 * 1024);
    expect(ALLOWED_LISTING_PHOTO_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("validates photo MIME types and sizes", () => {
    const jpeg = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const png = new File(["x"], "a.png", { type: "image/png" });
    const webp = new File(["x"], "a.webp", { type: "image/webp" });
    const gif = new File(["x"], "a.gif", { type: "image/gif" });

    expect(validateListingPhoto(jpeg)).toBeNull();
    expect(validateListingPhoto(png)).toBeNull();
    expect(validateListingPhoto(webp)).toBeNull();
    expect(validateListingPhoto(gif)).toBe("Unsupported image type (use JPEG, PNG, or WebP)");

    const big = new File([new Uint8Array(MAX_LISTING_PHOTO_BYTES + 1)], "big.png", { type: "image/png" });
    expect(validateListingPhoto(big)).toBe("Image is too large (max 5 MiB)");
  });

  it("reads a file as a base64 data URL and rejects on reader errors", async () => {
    const file = new File(["hello"], "a.png", { type: "image/png" });
    await expect(readFileAsDataUrl(file)).resolves.toContain("data:image/png;base64,");

    const original = FileReader;
    // Force the onerror path.
    const failingReader = function () {
      const reader = new original();
      Object.defineProperty(reader, "readAsDataURL", {
        value: () => {
          // simulate an error event being dispatched
          if (reader.onerror) reader.onerror(new ProgressEvent("error") as unknown as ProgressEvent<FileReader>);
        },
      });
      return reader;
    } as unknown as typeof FileReader;
    vi.stubGlobal("FileReader", failingReader);
    await expect(readFileAsDataUrl(file)).rejects.toBeInstanceOf(Error);
    vi.unstubAllGlobals();
  });

  it("maps owned counts per variant with null-safe entry", () => {
    expect(ownedCountForVariant(null, "normal")).toBe(0);
    expect(ownedCountForVariant(undefined, "foil")).toBe(0);
    expect(ownedCountForVariant({ quantity: 3, foilQuantity: 5, holofoilQuantity: 7 }, "normal")).toBe(3);
    expect(ownedCountForVariant({ quantity: 3, foilQuantity: 5, holofoilQuantity: 7 }, "foil")).toBe(5);
    expect(ownedCountForVariant({ quantity: 3, foilQuantity: 5, holofoilQuantity: 7 }, "holofoil")).toBe(7);
  });

  it("maps keep counts per variant", () => {
    const policy = { keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 2 };
    expect(keepCountForVariant(policy, "normal")).toBe(4);
    expect(keepCountForVariant(policy, "foil")).toBe(1);
    expect(keepCountForVariant(policy, "holofoil")).toBe(2);
  });

  it("computes the surplus floor at zero", () => {
    expect(surplusForVariant(5, 2)).toBe(3);
    expect(surplusForVariant(2, 5)).toBe(0);
    expect(surplusForVariant(2, 2)).toBe(0);
  });
});
