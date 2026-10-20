import type { ReviewSummary as ReviewSummaryData } from "../../types";

interface ReviewSummaryProps {
  label: string;
  review: ReviewSummaryData | null;
}

/**
 * Read-only review display (REQ-REV-2/4): the label plus either the star rating
 * (read-only glyphs with `aria-label="N out of 5"`, mirroring the seller page's
 * `RatingStars` — NOT the `StarRating` radio input) and the comment text, or a
 * neutral "no review yet" empty state when the review is absent.
 */
export default function ReviewSummary({ label, review }: ReviewSummaryProps) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/70">{label}</p>
      {review ? (
        <div className="mt-1">
          <span className="text-amber-400" aria-label={`${review.rating} out of 5`}>
            {"★".repeat(review.rating)}
            <span className="text-gray-700">{"★".repeat(5 - review.rating)}</span>
          </span>
          {review.comment && <p className="mt-1 text-sm text-gray-300">{review.comment}</p>}
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-500">no review yet</p>
      )}
    </div>
  );
}
