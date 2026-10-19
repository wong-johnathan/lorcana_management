import { useMemo, useState } from "react";
import { marketplace } from "../../services/api";
import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceListingPhoto,
  MarketplaceVariant,
} from "../../types";
import { availableInventoryVariants, INVENTORY_VARIANT_LABELS } from "../../utils/cardVariants";
import {
  MAX_LISTING_PHOTO_COUNT,
  keepCountForVariant,
  ownedCountForVariant,
  readFileAsDataUrl,
  surplusForVariant,
  validateListingPhoto,
} from "../../utils/marketplaceListing";
import {
  MARKETPLACE_CONDITION_OPTIONS,
  MARKETPLACE_CURRENCY_OPTIONS,
  MARKETPLACE_VARIANT_OPTIONS,
  priceMinorFromMajor,
} from "../../utils/marketplaceParams";
import { cardArtUrl } from "../../utils/cardImages";
import { PHOTO_LABEL_OPTIONS } from "../../utils/photoPositionLabels";
import MarketplaceImage from "./MarketplaceImage";
import ImageLightbox from "./ImageLightbox";
import TcgPriceReference from "./TcgPriceReference";

/** REQ-6: high-value printings where condition photos matter most. */
const PREMIUM_RARITIES = ["Enchanted", "Iconic"];

interface ListingFormProps {
  mode: "create" | "edit";
  /** Present in edit mode (may be null while the page hydrates it). */
  listing?: MarketplaceListing;
  /** REQ-8: price/currency/quantity are disabled while a PENDING tx exists. */
  locked?: boolean;
  /** The seller's inventory, used for the create card picker + owned-count cap (REQ-4). */
  inventory: InventoryEntry[];
  /** Keep policy for the surplus hint (REQ-5); advisory, may be null. */
  policy: InventoryPolicy | null;
  /** Create mode only — the card chosen in Step 1 of the picker (REQ-UX-5). */
  preselectedCardId?: string;
  /** Create mode only — return to Step 1 to re-pick (REQ-UX-9). */
  onBack?: () => void;
  onSaved: (listing: MarketplaceListing) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
}

interface PendingFile {
  file: File;
  label: string | null;
}

/**
 * Create/edit listing form (REQ-3/4/5/6/7/8/23/REQ-POL-9/11/12/13/14/15). Owns the
 * quantity cap at owned count, the variant/condition/currency dropdowns, the
 * surplus hint, the display-only TCG price reference, the shared card-summary
 * image, photo upload with the 15-count / 5 MiB / MIME limits, per-photo position
 * labels, and click-to-expand on saved photos.
 */
export default function ListingForm({
  mode,
  listing,
  locked = false,
  inventory,
  policy,
  preselectedCardId,
  onBack,
  onSaved,
  onDeleted,
  onCancel,
}: ListingFormProps) {
  const [cardId] = useState<string>(
    listing?.cardId ?? preselectedCardId ?? ""
  );
  const [variant, setVariant] = useState<MarketplaceVariant>(() => {
    if (listing) return listing.variant as MarketplaceVariant;
    if (mode === "create" && preselectedCardId) {
      const entry = inventory.find((item) => item.cardId === preselectedCardId);
      if (entry) {
        const allowed = availableInventoryVariants(entry.card);
        return allowed[0] ?? "normal";
      }
    }
    return "normal";
  });
  const [quantity, setQuantity] = useState<string>(
    listing ? String(listing.quantity) : "1"
  );
  const [price, setPrice] = useState<string>(
    listing ? (listing.priceMinor / 100).toFixed(2) : ""
  );
  const [currency, setCurrency] = useState<string>(listing?.currency ?? "USD");
  const [condition, setCondition] = useState<string>(listing?.condition ?? "");
  const [location, setLocation] = useState<string>(listing?.location ?? "");
  const [note, setNote] = useState<string>(listing?.note ?? "");
  const [photos, setPhotos] = useState<MarketplaceListingPhoto[]>(listing?.photos ?? []);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const selectedEntry = inventory.find((entry) => entry.cardId === cardId);
  const card = mode === "edit" ? listing?.card : selectedEntry?.card ?? null;
  const isPremium = card ? PREMIUM_RARITIES.includes(card.rarity) : false;

  const variantOptions = useMemo(() => {
    if (mode === "edit" || !card) return MARKETPLACE_VARIANT_OPTIONS;
    const allowed = availableInventoryVariants(card);
    return MARKETPLACE_VARIANT_OPTIONS.filter((option) => allowed.includes(option.value));
  }, [mode, card]);

  const owned = ownedCountForVariant(selectedEntry, variant);
  const keep = policy ? keepCountForVariant(policy, variant) : 0;
  const surplus = policy ? surplusForVariant(owned, keep) : 0;

  const totalPhotos = photos.length + pendingFiles.length;

  const summarySrc = card ? cardArtUrl(card) : "";
  const summaryHasSource = !!card?.imageUrl;
  const summaryAlt = card ? `${card.name} - ${card.subtitle}` : "Card image";

  const validateQuantity = (): number | null => {
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Quantity must be a whole number of at least 1");
      return null;
    }
    if (selectedEntry && parsed > owned) {
      setError(`You can only list up to ${owned} ${INVENTORY_VARIANT_LABELS[variant]} copies you own`);
      return null;
    }
    return parsed;
  };

  const onFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);

    if (totalPhotos + incoming.length > MAX_LISTING_PHOTO_COUNT) {
      setPhotoError(`Maximum of ${MAX_LISTING_PHOTO_COUNT} photos per listing`);
      return;
    }
    for (const file of incoming) {
      const validationError = validateListingPhoto(file);
      if (validationError) {
        setPhotoError(validationError);
        return;
      }
    }
    setPhotoError(null);

    if (mode === "edit" && listing) {
      // Edit mode: the listing already exists, so upload immediately (REQ-7/8).
      for (const file of incoming) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          const photo = await marketplace.uploadPhoto(listing.id, {
            dataUrl,
            contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          });
          setPhotos((prev) => [...prev, photo]);
        } catch (err) {
          setPhotoError(err instanceof Error ? err.message : "Failed to upload photo");
        }
      }
    } else {
      // Create mode: buffer, upload after the listing is created.
      setPendingFiles((prev) => [...prev, ...incoming.map((file) => ({ file, label: null }))]);
    }
  };

  const removePhoto = async (photoId: string) => {
    if (!listing) return;
    try {
      await marketplace.deletePhoto(listing.id, photoId);
      setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to remove photo");
    }
  };

  const relabelPhoto = async (photoId: string, label: string | null) => {
    if (!listing) return;
    try {
      const updated = await marketplace.updatePhotoLabel(listing.id, photoId, label);
      setPhotos((prev) => prev.map((photo) => (photo.id === photoId ? updated : photo)));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to update photo label");
    }
  };

  const setPendingLabel = (index: number, label: string | null) => {
    setPendingFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, label } : item))
    );
  };

  const openLightbox = (src: string, alt: string) => setLightbox({ src, alt });
  const closeLightbox = () => setLightbox(null);

  const photoAlt = (photo: MarketplaceListingPhoto): string =>
    `${card?.name ?? "Card"} — condition photo${photo.label ? ` (${photo.label})` : ""}`;

  const renderLabelSelect = (
    value: string | null,
    onChangeLabel: (label: string | null) => void
  ) => (
    <select
      aria-label="Photo position"
      value={value ?? ""}
      onChange={(event) =>
        onChangeLabel(event.target.value === "" ? null : event.target.value)
      }
      className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 focus:border-amber-500 focus:outline-none"
    >
      <option value="">No label</option>
      {PHOTO_LABEL_OPTIONS.map((label) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
    </select>
  );

  const submit = async () => {
    setError(null);
    if (mode === "create" && !cardId) {
      setError("Select a card to list");
      return;
    }
    const qty = validateQuantity();
    if (qty == null) return;
    const priceMinor = priceMinorFromMajor(price);
    if (priceMinor == null) {
      setError("Enter a valid price");
      return;
    }

    setSubmitting(true);
    try {
      const conditionValue = condition || null;
      const locationValue = location.trim();
      const noteValue = note.trim() || null;

      let saved: MarketplaceListing;
      if (mode === "create") {
        saved = await marketplace.createListing({
          cardId,
          variant,
          quantity: qty,
          priceMinor,
          currency,
          condition: conditionValue,
          location: locationValue,
          note: noteValue,
        });
      } else {
        if (!listing) throw new Error("Listing is missing");
        saved = await marketplace.updateListing(listing.id, {
          // REQ-8: price/currency/quantity are locked while a PENDING tx exists.
          ...(locked ? {} : { quantity: qty, priceMinor, currency }),
          condition: conditionValue,
          location: locationValue,
          note: noteValue,
        });
      }

      for (const { file, label } of pendingFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        await marketplace.uploadPhoto(saved.id, {
          dataUrl,
          contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          label,
        });
      }
      setPendingFiles([]);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save listing");
    } finally {
      setSubmitting(false);
    }
  };

  const removeListing = async () => {
    if (!listing) return;
    setDeleting(true);
    setError(null);
    try {
      await marketplace.deleteListing(listing.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete listing");
      setDeleting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      {/* Locked-card summary (REQ-UX-5 / REQ-POL-9): art + name + set, shared by
          create and edit; edit also surfaces the immutable variant label. */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-sm">
        <MarketplaceImage
          src={summarySrc}
          alt={summaryAlt}
          hasSource={summaryHasSource}
          className="h-16 w-12 shrink-0 rounded object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-100">
            {card?.name ?? "Unknown card"}
          </p>
          {card?.setName ? (
            <p className="truncate text-xs text-gray-400">{card.setName}</p>
          ) : null}
          {mode === "edit" && (
            <p className="mt-1 text-xs text-amber-300">
              {INVENTORY_VARIANT_LABELS[variant]}
            </p>
          )}
        </div>
      </div>

      {mode === "create" && (
        <label className="block text-sm text-gray-300">
          Variant
          <select
            value={variant}
            onChange={(event) => setVariant(event.target.value as MarketplaceVariant)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
          >
            {variantOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-gray-300">
          Quantity
          <input
            type="number"
            min={1}
            value={quantity}
            disabled={locked}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {owned > 0 && (
            <span className="mt-1 block text-xs text-gray-500">
              You own {owned} {INVENTORY_VARIANT_LABELS[variant]} {owned === 1 ? "copy" : "copies"}.
            </span>
          )}
        </label>

        <label className="block text-sm text-gray-300">
          Currency
          <select
            value={currency}
            disabled={locked}
            onChange={(event) => setCurrency(event.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {MARKETPLACE_CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-gray-300">
            Price
            <input
              type="text"
              inputMode="decimal"
              value={price}
              disabled={locked}
              placeholder="0.00"
              onChange={(event) => setPrice(event.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <TcgPriceReference prices={card?.prices ?? []} variant={variant} />
        </div>

        <label className="block text-sm text-gray-300">
          Condition
          <select
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="">Not specified</option>
            {MARKETPLACE_CONDITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm text-gray-300">
        Location
        <input
          type="text"
          value={location}
          placeholder="e.g. London, UK"
          onChange={(event) => setLocation(event.target.value)}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
        />
      </label>

      <label className="block text-sm text-gray-300">
        Note
        <textarea
          value={note}
          rows={3}
          placeholder="Condition details, shipping notes, contact preferences…"
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
        />
      </label>

      {surplus > 0 && (
        <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-300">
          You have {surplus} surplus {INVENTORY_VARIANT_LABELS[variant]}{" "}
          {surplus === 1 ? "copy" : "copies"} beyond your keep policy — good
          candidates to list.
        </p>
      )}

      {/* Photos (REQ-6 / REQ-23 / REQ-POL-14/15) */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Actual condition photos
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Up to {MAX_LISTING_PHOTO_COUNT} photos, 5 MiB each (JPEG, PNG, or WebP).
        </p>

        {isPremium && (
          <p className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-300">
            {card?.rarity} cards are high-value — include a clear condition photo
            before buying or selling.
          </p>
        )}

        {(photos.length > 0 || pendingFiles.length > 0) && (
          <ul className="mt-3 space-y-2">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 p-2"
              >
                <MarketplaceImage
                  src={photo.url}
                  alt={photoAlt(photo)}
                  hasSource
                  className="h-12 w-12 rounded object-cover"
                  onOpen={() => openLightbox(photo.url, photoAlt(photo))}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                  {photo.label ? `Saved photo · ${photo.label}` : "Saved photo"}
                </span>
                {renderLabelSelect(photo.label, (label) => void relabelPhoto(photo.id, label))}
                <button
                  type="button"
                  onClick={() => void removePhoto(photo.id)}
                  className="rounded-md border border-gray-700 px-2 py-1 text-xs text-red-300 hover:border-red-700"
                >
                  Remove
                </button>
              </li>
            ))}
            {pendingFiles.map(({ file, label }, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 p-2"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                  {file.name} ({(file.size / 1024).toFixed(0)} KiB) — saved on submit
                </span>
                {renderLabelSelect(label, (next) => setPendingLabel(index, next))}
                <button
                  type="button"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-md border border-gray-700 px-2 py-1 text-xs text-red-300 hover:border-red-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {totalPhotos < MAX_LISTING_PHOTO_COUNT && (
          <label className="mt-3 block">
            <span className="inline-block rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500">
              Add photos
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => {
                void onFilesSelected(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        )}

        {photoError && <p className="mt-2 text-sm text-red-300">{photoError}</p>}
      </section>

      {locked && (
        <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-300">
          Price, currency, and quantity are locked while a sale is pending.
          Note and photos remain editable.
        </p>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={submitting || deleting}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-900 disabled:text-amber-300"
        >
          {submitting ? "Saving…" : mode === "create" ? "Create listing" : "Save changes"}
        </button>

        {mode === "create" && onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={submitting || deleting}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 disabled:opacity-50"
          >
            Back
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting || deleting}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        {mode === "edit" && onDeleted && (
          <button
            type="button"
            onClick={() => void removeListing()}
            disabled={submitting || deleting || locked}
            className="ml-auto rounded-lg border border-red-800 px-4 py-2 text-sm text-red-300 hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete listing"}
          </button>
        )}
      </div>

      {lightbox && (
        <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      )}
    </form>
  );
}
