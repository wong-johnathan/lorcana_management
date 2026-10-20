import { useId, useState } from "react";
import ReviewSummary from "./ReviewSummary";
import type { ReviewSummary as ReviewSummaryData } from "../../types";

interface ReviewAccordionProps {
  myReview: ReviewSummaryData | null;
  counterpartReview: ReviewSummaryData | null;
  /** Role of the OTHER party (the counterpart's review of the caller). */
  counterpartRole: "seller" | "buyer";
}

/**
 * Inline review-comments disclosure rendered in the thread's completed block
 * (REQ-REV-2). A real `<button>` (keyboard-operable) toggles the panel inline
 * with no route change, carrying `aria-expanded`/`aria-controls`; the panel is a
 * labelled `role="region"` containing two read-only `ReviewSummary` blocks.
 * Default collapsed.
 */
export default function ReviewAccordion({
  myReview,
  counterpartReview,
  counterpartRole,
}: ReviewAccordionProps) {
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const panelId = useId();

  const counterpartLabel = counterpartRole === "seller" ? "Seller's review" : "Buyer's review";

  return (
    <div className="mt-3 border-t border-emerald-900/60 pt-3">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-sm font-medium text-emerald-300 hover:text-emerald-100"
      >
        <span>View reviews</span>
        <span aria-hidden="true" className={`transform transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
        <ReviewSummary label="Your review" review={myReview} />
        <ReviewSummary label={counterpartLabel} review={counterpartReview} />
      </div>
    </div>
  );
}
