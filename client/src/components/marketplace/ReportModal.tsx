import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { marketplace } from "../../services/api";

interface ReportModalProps {
  targetType: "LISTING" | "USER";
  targetId: string;
  /** Human-readable label for the trigger, e.g. "Report listing". */
  label?: string;
}

/**
 * Self-contained report modal (REQ-22). Anonymous users are prompted to sign
 * in (writes require an account, REQ-2); authed users submit a reason that is
 * persisted via `POST /marketplace/reports`.
 */
export default function ReportModal({ targetType, targetId, label }: ReportModalProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const triggerLabel = label ?? (targetType === "USER" ? "Report user" : "Report listing");

  const openModal = () => {
    setDone(false);
    setError(null);
    setReason("");
    setOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
    setError(null);
  };

  const submit = async () => {
    if (!user || !reason.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await marketplace.report({ targetType, targetId, reason: reason.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-red-700 hover:text-red-300 focus:outline-none focus:border-amber-500"
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={triggerLabel}
            className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-100">{triggerLabel}</h2>

            {!user ? (
              <div className="mt-4 space-y-4 text-sm text-gray-400">
                <p>You need an account to submit a report.</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <Link
                    to="/login"
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-amber-400"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            ) : done ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-emerald-300">Report submitted. Thank you for helping keep the marketplace safe.</p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-gray-300">
                  Reason
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Describe the problem..."
                    rows={4}
                    className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                  />
                </label>

                {error && <p className="text-sm text-red-300">{error}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!reason.trim() || submitting}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900 disabled:text-red-300"
                  >
                    {submitting ? "Submitting..." : "Submit report"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
