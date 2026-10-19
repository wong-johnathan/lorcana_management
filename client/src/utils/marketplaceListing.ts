import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceVariant,
} from "../types";

/**
 * Client-side mirrors of the listing/photo rules the server enforces
 * (design D7 / REQ-23): 15 photos, 5 MiB each, image/jpeg | image/png |
 * image/webp. Validation happens here BEFORE any upload so oversized or
 * unsupported files never reach the wire (AC-23.2). Also small surplus-hint
 * helpers (REQ-5) mirroring `calculateExtras` / `resolveKeepCounts`.
 */

export const MAX_LISTING_PHOTO_COUNT = 15;
export const MAX_LISTING_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MiB
export const ALLOWED_LISTING_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Returns a human-readable rejection message, or null when the file is valid. */
export function validateListingPhoto(file: File): string | null {
  if (!ALLOWED_LISTING_PHOTO_MIME_TYPES.includes(file.type as (typeof ALLOWED_LISTING_PHOTO_MIME_TYPES)[number])) {
    return "Unsupported image type (use JPEG, PNG, or WebP)";
  }
  if (file.size > MAX_LISTING_PHOTO_BYTES) {
    return "Image is too large (max 5 MiB)";
  }
  return null;
}

/** Reads a File as a base64 data URL (the upload contract expects dataUrl + contentType). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/** Owned count for a wire variant, mapped to the matching InventoryEntry column (D1). */
export function ownedCountForVariant(
  entry: Pick<InventoryEntry, "quantity" | "foilQuantity" | "holofoilQuantity"> | null | undefined,
  variant: MarketplaceVariant
): number {
  if (!entry) return 0;
  switch (variant) {
    case "normal":
      return entry.quantity;
    case "foil":
      return entry.foilQuantity;
    case "holofoil":
      return entry.holofoilQuantity;
  }
}

/** Keep count for a wire variant from the inventory policy (D1). */
export function keepCountForVariant(policy: InventoryPolicy, variant: MarketplaceVariant): number {
  switch (variant) {
    case "normal":
      return policy.keepNormalQuantity;
    case "foil":
      return policy.keepFoilQuantity;
    case "holofoil":
      return policy.keepHolofoilQuantity;
  }
}

/** Surplus copies beyond the keep policy (REQ-5, advisory — mirrors calculateVariantExtra). */
export function surplusForVariant(owned: number, keep: number): number {
  return Math.max(0, owned - keep);
}
