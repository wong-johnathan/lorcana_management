import { useEffect, useRef, useState } from "react";
import type { ListingImageItem } from "../../utils/listingImages";

interface ListingImageCarouselProps {
  /** Ordered, non-empty image list (parents guard; the component renders null if empty). */
  images: ListingImageItem[];
  /** 0-based index to open at; clamped to [0, images.length - 1]. */
  startIndex: number;
  onClose: () => void;
}

function clamp(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * Carousel lightbox (REQ-LB-1): a full-size `role="dialog"` viewer that shows
 * one image at a time from an ordered `{ src, caption }[]` list, with prev/next
 * arrows, a "N / M" indicator, a visible caption, and ×/backdrop/Escape
 * dismissal. Supersedes the single-image viewer.
 */
export default function ListingImageCarousel({
  images,
  startIndex,
  onClose,
}: ListingImageCarouselProps) {
  // Parent mounts the component fresh each open, so the initial state is always
  // the clicked image (clamped defensively) — no reset effect needed.
  const [index, setIndex] = useState(() => clamp(startIndex, images.length));
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Capture the trigger (the element focused at open time) for focus return.
    previouslyFocused.current = document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      } else if (event.key === "ArrowLeft") {
        setIndex((prev) => Math.max(0, prev - 1));
      } else if (event.key === "ArrowRight") {
        setIndex((prev) => Math.min(images.length - 1, prev + 1));
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [images.length]);

  if (images.length === 0) {
    return null;
  }

  const current = images[index];
  const isFirst = index === 0;
  const isLast = index === images.length - 1;
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(images.length - 1, i + 1));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.caption}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-gray-600 bg-gray-900/80 text-xl text-gray-200 hover:border-gray-400 hover:text-white focus:border-amber-500 focus:outline-none"
      >
        ×
      </button>

      {/* The image content (arrows + image + indicator + caption) stops
          propagation so only a genuine backdrop click closes the viewer. */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full flex-col items-center gap-4"
      >
        <div className="flex w-full items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Previous image"
            onClick={prev}
            disabled={isFirst}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-600 bg-gray-900/80 text-2xl text-gray-200 hover:border-gray-400 hover:text-white focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>

          <img
            src={current.src}
            alt={current.caption}
            className="max-h-[70vh] max-w-full rounded object-contain"
          />

          <button
            type="button"
            aria-label="Next image"
            onClick={next}
            disabled={isLast}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-600 bg-gray-900/80 text-2xl text-gray-200 hover:border-gray-400 hover:text-white focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <p aria-live="polite" className="text-sm text-gray-300">
            {index + 1} / {images.length}
          </p>
          <p className="text-sm text-gray-100">{current.caption}</p>
        </div>
      </div>
    </div>
  );
}
