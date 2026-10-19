import { useState } from "react";
import { marketplace } from "../../services/api";
import StarRating from "./StarRating";

interface InlineReviewFormProps {
  transactionId: string;
  revieweeRole: "buyer" | "seller";
  myReview: { rating: number; comment: string | null } | null;
  onSubmitted?: () => void;
}

/**
 * Inline review prompt shown inside the thread's completed-transaction block
 * (REQ-TX-3/5). When `myReview` is already present (server-authoritative), or
 * after a successful/409 submit, it renders a "review submitted" state instead
 * of the prompt. Submits via the existing `marketplace.postReview` and surfaces
 * other failures inline while keeping the prompt available for retry.
 */
export default function InlineReviewForm({
  transactionId,
  revieweeRole,
  myReview,
  onSubmitted,
}: InlineReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = revieweeRole === "seller" ? "Review the seller" : "Review the buyer";

  if (myReview || submitted) {
    const submittedRating = myReview?.rating ?? rating;
    return (
      <div className="mt-3 border-t border-emerald-900/60 pt-3">
        <p className="text-sm font-medium text-emerald-300">Review submitted.</p>
        <p className="mt-1 text-xs text-emerald-200/80">
          {submittedRating} {submittedRating === 1 ? "star" : "stars"}
        </p>
      </div>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await marketplace.postReview(
        transactionId,
        rating,
        comment.trim() || undefined
      );
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      if ((err as { status?: number }).status === 409) {
        setSubmitted(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to submit review");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 border-t border-emerald-900/60 pt-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/70">
        {title}
      </p>
      <StarRating value={rating} onChange={setRating} disabled={submitting} />
      <label className="mt-2 block text-sm text-emerald-100">
        Comment (optional)
        <textarea
          value={comment}
          rows={2}
          placeholder="How was the trade?"
          disabled={submitting}
          onChange={(event) => setComment(event.target.value)}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none disabled:opacity-50"
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={rating < 1 || submitting}
        className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
  );
}
