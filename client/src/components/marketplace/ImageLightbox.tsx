import { useEffect, useRef } from "react";

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Reusable full-size image viewer (REQ-POL-13), following the ReportModal
 * `role="dialog"`/`aria-modal` convention with backdrop + × + Escape dismissal
 * and focus returned to the trigger on close. Controlled by the parent (rendered
 * only while open).
 */
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
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
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
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
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded object-contain"
      />
    </div>
  );
}
