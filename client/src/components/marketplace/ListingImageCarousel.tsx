import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import type { ListingImageItem } from "../../utils/listingImages";

interface ListingImageCarouselProps {
  /** Ordered, non-empty image list (parents guard; the component renders null if empty). */
  images: ListingImageItem[];
  /** 0-based index to open at; clamped to [0, images.length - 1]. */
  startIndex: number;
  onClose: () => void;
}

/** Minimum horizontal drag before a touch gesture counts as a swipe. */
const SWIPE_THRESHOLD_PX = 40;

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

  // Touch navigation: the arrows are the only way to move on a phone, and
  // swiping is the gesture people actually try first.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Ignore taps and mostly-vertical drags; a swipe must be deliberate and
    // horizontal so it can never fight a scroll.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) next();
    else prev();
  };

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
          propagation so only a genuine backdrop click closes the viewer.
          Arrows overlay the image instead of sitting beside it: side-by-side
          sizing pushed both of them off a phone viewport. */}
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full flex-col items-center gap-4"
      >
        <div
          role="group"
          aria-label={current.caption}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="relative flex w-full items-center justify-center [touch-action:pan-y]"
        >
          <img
            src={current.src}
            alt={current.caption}
            className="max-h-[70vh] max-w-full rounded object-contain"
          />

          <button
            type="button"
            aria-label="Previous image"
            onClick={prev}
            disabled={isFirst}
            className="absolute left-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-500 bg-gray-950/70 pb-1 text-2xl text-gray-100 backdrop-blur-sm hover:border-gray-300 hover:text-white focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30"
          >
            ‹
          </button>

          <button
            type="button"
            aria-label="Next image"
            onClick={next}
            disabled={isLast}
            className="absolute right-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-500 bg-gray-950/70 pb-1 text-2xl text-gray-100 backdrop-blur-sm hover:border-gray-300 hover:text-white focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30"
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
