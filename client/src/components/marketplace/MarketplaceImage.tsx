import { useState } from "react";

interface MarketplaceImageProps {
  /** The image URL to attempt when a real source exists. */
  src: string;
  /** Accessible label for the rendered image. */
  alt: string;
  /** Whether a real source exists (false → the static fallback renders immediately). */
  hasSource: boolean;
  className?: string;
  /** When provided, the image is wrapped in a lightbox-trigger button. */
  onOpen?: () => void;
}

const FALLBACK_SRC = "/lorcana-logo.png";

/**
 * Shared marketplace image with a single "no art" fallback (REQ-POL-12):
 * renders the static Lorcana logo/wordmark PNG when there is no source, and
 * swaps to it on `<img>` load failure (e.g. a `/api/card-images/:id` 404).
 */
export default function MarketplaceImage({
  src,
  alt,
  hasSource,
  className,
  onOpen,
}: MarketplaceImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = !hasSource || failed ? FALLBACK_SRC : src;

  const image = (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="h-full w-full cursor-zoom-in"
        aria-label={`View ${alt}`}
      >
        {image}
      </button>
    );
  }

  return image;
}
