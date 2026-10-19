import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * Auth gate for the authed marketplace surfaces (chat/sell/transactions). All
 * writes and personal data require a registered account (REQ-2); anonymous
 * visitors are prompted to sign in instead of the page silently redirecting.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8">
        <h1 className="text-xl font-semibold text-gray-100">Sign in required</h1>
        <p className="mt-2 text-sm text-gray-400">
          Chatting, selling, and reviewing trades need a registered account.
        </p>
        <Link
          to="/login"
          className="mt-5 inline-block rounded-lg bg-amber-500 px-4 py-2 font-semibold text-gray-950 hover:bg-amber-400"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
