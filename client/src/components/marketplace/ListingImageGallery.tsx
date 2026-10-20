import { useRef, useState } from "react";
import type { Card, MarketplaceListingPhoto } from "../../types";
import { listingImageItems } from "../../utils/listingImages";
import type { ListingImageItem } from "../../utils/listingImages";
import ListingImageCarousel from "./ListingImageCarousel";
import MarketplaceImage from "./MarketplaceImage";
import { useThumbnailStripOverflow } from "./useThumbnailStripOverflow";

interface ListingImageGalleryProps {
  /** The listing's card (card art becomes the first image when it has art). */
  card: Card | null;
  /** Condition photos in wire order (`sortOrder` ascending, already server-sorted). */
  photos: MarketplaceListingPhoto[];
}

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950";

/** Gap between thumbnails (`gap-2`); chevron steps leave one thumbnail in common. */
const THUMBNAIL_GAP_PX = 8;

/** Visible caption; `Image k of M` is the defensive fallback for an empty caption. */
function displayCaption(item: ListingImageItem, index: number, total: number): string {
  return item.caption || `Image ${index + 1} of ${total}`;
}

/** Thumbnail accessible name — the caption plus its 1-based position. */
function thumbAriaLabel(item: ListingImageItem, index: number, total: number): string {
  const fallback = `Image ${index + 1} of ${total}`;
  return item.caption ? `${item.caption}, image ${index + 1} of ${total}` : fallback;
}

/**
 * Width of one thumbnail. Every child of the strip is a thumbnail button, so
 * the widest child is that thumbnail's width; an unmeasurable host yields 0.
 */
function thumbnailWidth(strip: HTMLElement): number {
  return Array.from(strip.children).reduce(
    (widest, child) => Math.max(widest, (child as HTMLElement).offsetWidth),
    0
  );
}

/**
 * The listing-detail image gallery (REQ-GAL-1..8): one contain-fit primary
 * image with a visible caption, a single-row thumbnail strip carrying the
 * selected state, overflow chevrons, and the unchanged carousel lightbox
 * opened at the selected image.
 *
 * All state is view-local: `selectedIndex` (never persisted) and
 * `carouselIndex` (lightbox open-at index).
 */
export default function ListingImageGallery({ card, photos }: ListingImageGalleryProps) {
  const items = listingImageItems(card, photos);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const { overflow, canScrollLeft, canScrollRight, scrollBy } = useThumbnailStripOverflow(
    stripRef,
    items.length
  );

  if (items.length === 0) {
    return (
      <div className="flex min-h-[12rem] w-full items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/60 text-sm text-gray-400">
        No condition photos
      </div>
    );
  }

  // Defensive clamp only — the selection is never reset by prop changes.
  const currentIndex = Math.min(selectedIndex, items.length - 1);
  const selected = items[currentIndex];
  const caption = displayCaption(selected, currentIndex, items.length);

  // Chevrons render in the same tree as the strip, so the ref is assigned
  // before any chevron can be clicked. Step = viewport − one thumbnail − gap.
  const scrollStep = () => {
    const strip = stripRef.current!;
    return Math.max(0, strip.clientWidth - (thumbnailWidth(strip) + THUMBNAIL_GAP_PX));
  };

  return (
    <>
      <section aria-label="Listing images">
        <button
          type="button"
          aria-label={`View ${caption}`}
          onClick={() => setCarouselIndex(currentIndex)}
          className={`w-full h-[clamp(15rem,55vh,32.5rem)] rounded-xl border border-gray-800 bg-gray-900 overflow-hidden cursor-zoom-in hover:border-gray-600 ${FOCUS_RING}`}
        >
          {/* `key` resets MarketplaceImage's per-instance `failed` latch when the
              selection changes: one instance now serves every image, so without
              it a single 404 would pin the logo over all later selections
              (AC-GAL-3.3). Remounting also retries a previously failed source. */}
          <MarketplaceImage
            key={selected.src}
            src={selected.src}
            alt={caption}
            hasSource
            className="h-full w-full object-contain"
          />
        </button>

        <p className="mt-3 min-h-[2.5rem] text-sm leading-5 text-gray-300 break-words">{caption}</p>

        {items.length >= 2 && (
          <div className="mt-3 flex items-center gap-2">
            <div
              ref={stripRef}
              role="group"
              aria-label="Image thumbnails"
              className="order-2 flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {items.map((item, index) => {
                const isSelected = index === currentIndex;
                return (
                  <button
                    key={item.src + index}
                    type="button"
                    aria-label={thumbAriaLabel(item, index, items.length)}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedIndex(index)}
                    className={`shrink-0 h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16 rounded-lg border-2 bg-gray-950 overflow-hidden ${
                      isSelected
                        ? "border-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
                        : "border-gray-800 hover:border-gray-500"
                    } ${FOCUS_RING}`}
                  >
                    <MarketplaceImage src={item.src} alt="" hasSource className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>

            {/* DOM after the strip (focus order primary → thumbnails → chevrons);
                flex `order` places them visually left/right. */}
            {overflow && (
              <>
                <button
                  type="button"
                  aria-label="Scroll thumbnails left"
                  disabled={!canScrollLeft}
                  onClick={() => scrollBy(-scrollStep())}
                  className={`order-1 shrink-0 flex h-11 w-11 items-center justify-center rounded-full border border-gray-500 bg-gray-900/80 text-2xl leading-none text-gray-200 hover:border-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Scroll thumbnails right"
                  disabled={!canScrollRight}
                  onClick={() => scrollBy(scrollStep())}
                  className={`order-3 shrink-0 flex h-11 w-11 items-center justify-center rounded-full border border-gray-500 bg-gray-900/80 text-2xl leading-none text-gray-200 hover:border-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
                >
                  ›
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {carouselIndex != null && (
        <ListingImageCarousel
          images={items}
          startIndex={carouselIndex}
          onClose={() => setCarouselIndex(null)}
        />
      )}
    </>
  );
}
