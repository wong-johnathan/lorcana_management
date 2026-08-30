import { useEffect, useRef, useState } from "react";
import type { User } from "../../types";

interface GoogleCredentialResponse {
  credential?: string;
}

interface AccountSettingsPanelProps {
  user: User;
  googleClientId: string | null;
  linking: boolean;
  deleting: boolean;
  onLinkGoogle: (credential: string) => Promise<void> | void;
  onDeleteAccount: (confirmUsername: string, confirmText: string) => Promise<void> | void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function AccountSettingsPanel({ user, googleClientId, linking, deleting, onLinkGoogle, onDeleteAccount }: AccountSettingsPanelProps) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const googleLinked = Boolean(user.googleLinked || (user.authProvider === "GOOGLE" && user.emailVerifiedAt));
  const canDelete = confirmUsername === user.username && confirmText === "DELETE";

  useEffect(() => {
    if (!googleClientId || googleLinked) return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response.credential) {
            setGoogleError("Google did not return a link credential");
            return;
          }
          setGoogleError(null);
          await onLinkGoogle(response.credential);
        },
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        type: "standard",
        shape: "pill",
        width: 260,
        text: "continue_with",
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () => setGoogleError("Failed to load Google account linking");
    document.head.appendChild(script);
  }, [googleClientId, googleLinked, onLinkGoogle]);

  const resetDeleteDialog = () => {
    setDeleteStep(0);
    setConfirmUsername("");
    setConfirmText("");
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    await onDeleteAccount(confirmUsername, confirmText);
    resetDeleteDialog();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Account</h3>
        <p className="mt-1 text-sm text-gray-400">Manage sign-in methods and irreversible account deletion.</p>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">Google account</p>
            <p className="text-sm text-gray-400">
              {googleLinked
                ? `Google linked${user.email ? `: ${user.email}` : ""}`
                : "Link Google to verify your email while keeping password login available."}
            </p>
          </div>
          {!googleLinked && (
            <div className="flex min-w-[260px] justify-start sm:justify-end">
              {googleClientId ? (
                <div ref={googleButtonRef} aria-label="Link Google account" className={linking ? "pointer-events-none opacity-60" : undefined} />
              ) : (
                <span className="rounded border border-gray-800 px-3 py-2 text-sm text-gray-500">Google not configured</span>
              )}
            </div>
          )}
        </div>
        {googleError && <p className="text-sm text-red-300">{googleError}</p>}
      </div>

      <div className="rounded-lg border border-red-900/70 bg-red-950/20 p-3 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-red-200">Danger Zone</p>
            <p className="text-sm text-red-300/80">Deleting your account removes your inventory, profile, listings, enquiries, and marketplace data.</p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteStep(1)}
            className="rounded border border-red-700 px-3 py-2 text-sm font-semibold text-red-200 transition-colors hover:border-red-400 hover:text-red-100"
          >
            Delete account
          </button>
        </div>
      </div>

      {deleteStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-900 bg-gray-950 p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-red-200">Delete account?</h3>
              <p className="mt-2 text-sm text-gray-300">
                This is permanent. Cascading deletion will remove your Lorcana inventory, profile, public collection, extras listings, and marketplace records.
              </p>
            </div>

            {deleteStep === 1 ? (
              <div className="flex justify-end gap-2">
                <button type="button" onClick={resetDeleteDialog} className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-gray-500">Cancel</button>
                <button type="button" onClick={() => setDeleteStep(2)} className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">I understand, continue</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="delete-confirm-username" className="mb-1 block text-sm text-gray-300">Type your username</label>
                  <input
                    id="delete-confirm-username"
                    value={confirmUsername}
                    onChange={(event) => setConfirmUsername(event.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="delete-confirm-text" className="mb-1 block text-sm text-gray-300">Type DELETE</label>
                  <input
                    id="delete-confirm-text"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
                    autoComplete="off"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={resetDeleteDialog} className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-gray-500">Cancel</button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!canDelete || deleting}
                    className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                  >
                    {deleting ? "Deleting..." : "Permanently delete account"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
