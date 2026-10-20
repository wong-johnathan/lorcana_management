import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

/** The measured state of a horizontal thumbnail strip. */
export interface ThumbnailStripOverflow {
  /** `scrollWidth > clientWidth` — the strip has content off-screen. */
  overflow: boolean;
  /** `scrollLeft > 0` (1 px tolerance) — there is content to the left. */
  canScrollLeft: boolean;
  /** `scrollLeft + clientWidth < scrollWidth - 1` — content to the right. */
  canScrollRight: boolean;
}

export interface UseThumbnailStripOverflowResult extends ThumbnailStripOverflow {
  /** Scroll the strip by `delta` px, honouring `prefers-reduced-motion`. */
  scrollBy: (delta: number) => void;
}

const IDLE: ThumbnailStripOverflow = {
  overflow: false,
  canScrollLeft: false,
  canScrollRight: false,
};

function sameMeasurement(a: ThumbnailStripOverflow, b: ThumbnailStripOverflow): boolean {
  return (
    a.overflow === b.overflow &&
    a.canScrollLeft === b.canScrollLeft &&
    a.canScrollRight === b.canScrollRight
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Measures a horizontally scrolling thumbnail strip (REQ-GAL-3.6): whether it
 * overflows at all and which ends still have content, so the caller can mount
 * the chevron pair only on overflow and disable the exhausted end.
 *
 * Recomputed on mount, on the strip's `scroll`, on a `ResizeObserver` (when the
 * host provides one — jsdom does not) and on a `window` `resize` fallback.
 * `itemCount` is a recompute trigger for when the strip's content changes.
 */
export function useThumbnailStripOverflow(
  stripRef: RefObject<HTMLDivElement | null>,
  itemCount: number
): UseThumbnailStripOverflowResult {
  const [state, setState] = useState<ThumbnailStripOverflow>(IDLE);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      const next: ThumbnailStripOverflow = {
        overflow: strip.scrollWidth > strip.clientWidth,
        canScrollLeft: strip.scrollLeft > 1,
        canScrollRight: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      };
      setState((previous) => (sameMeasurement(previous, next) ? previous : next));
    };

    measure();
    strip.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(strip);
    }

    return () => {
      strip.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [stripRef, itemCount]);

  const scrollBy = useCallback(
    (delta: number) => {
      const strip = stripRef.current;
      if (!strip) return;
      const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
      if (typeof strip.scrollBy === "function") {
        // `scroll` re-reads the overflow state once the browser has scrolled.
        strip.scrollBy({ left: delta, behavior });
      } else {
        // Belt-and-suspenders for hosts without Element.scrollBy (jsdom).
        strip.scrollLeft += delta;
      }
    },
    [stripRef]
  );

  return { ...state, scrollBy };
}
