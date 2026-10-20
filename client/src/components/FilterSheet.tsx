import { useEffect, useRef, type ReactNode } from "react";

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional result count shown on the primary button. */
  resultCount?: number;
  children: ReactNode;
}

/**
 * Mobile-only bottom sheet for the search filters.
 *
 * The desktop filter bar is too wide for a phone, so below `md` every control
 * (except search, which stays inline) lives in here. Rendered as a real modal:
 * Escape / backdrop close it, the page behind is scroll-locked, and focus moves
 * into the panel.
 */
export default function FilterSheet({
  open,
  onClose,
  title = "Filters",
  resultCount,
  children,
}: FilterSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-gray-700 bg-gray-900 shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>

        <div className="border-t border-gray-800 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-gray-950 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            {typeof resultCount === "number" ? `Show ${resultCount} results` : "Show results"}
          </button>
        </div>
      </div>
    </div>
  );
}
