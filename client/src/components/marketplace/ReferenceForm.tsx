import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { marketplace } from "../../services/api";
import type { UserReference } from "../../types";

interface ReferenceFormProps {
  subjectId: string;
  onSubmitted?: (reference: UserReference) => void;
}

/**
 * Leave-vouch form (REQ-20). Anonymous users are prompted to sign in; authed
 * users submit a free-form reference. The server upserts, so submitting again
 * replaces the author's prior vouch (one vouch per user, AC-20.2).
 */
export default function ReferenceForm({ subjectId, onSubmitted }: ReferenceFormProps) {
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
        <Link to="/login" className="text-amber-400 hover:text-amber-300">
          Sign in
        </Link>{" "}
        to leave a reference.
      </div>
    );
  }

  const submit = async () => {
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const reference = await marketplace.vouch(subjectId, comment.trim());
      setComment("");
      setSuccess(true);
      onSubmitted?.(reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit reference");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-100">Leave a reference</h3>
      <label className="mt-3 block text-sm text-gray-300">
        Your reference
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="How was your experience with this trader?"
          rows={3}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
        />
      </label>

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-300">Reference saved.</p>}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!comment.trim() || submitting}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-900 disabled:text-amber-300"
        >
          {submitting ? "Saving..." : "Leave reference"}
        </button>
      </div>
    </div>
  );
}
