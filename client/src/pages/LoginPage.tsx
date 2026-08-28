import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { login, register, loginWithGoogle, registrationEnabled, googleClientId } = useAuth();
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!googleClientId) return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response.credential) {
            setError("Google did not return a sign-in credential");
            return;
          }
          setError("");
          setLoading(true);
          try {
            await loginWithGoogle(response.credential);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google sign-in failed");
          } finally {
            setLoading(false);
          }
        },
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        type: "standard",
        shape: "pill",
        width: 320,
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
    script.onerror = () => setError("Failed to load Google sign-in");
    document.head.appendChild(script);
  }, [googleClientId, loginWithGoogle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister && registrationEnabled) {
        await register(username, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl p-8 w-full max-w-md border border-gray-800">
        <h1 className="text-3xl font-bold text-amber-400 text-center mb-2">
          Lorcana Inventory
        </h1>
        <p className="text-gray-500 text-center mb-8">
          Track your collection and trade extras
        </p>

        <div className="space-y-4">
          <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-100">
            Marketplace access requires a verified Google email.
          </div>

          {googleClientId ? (
            <div className="flex justify-center" ref={googleButtonRef} aria-label="Continue with Google" />
          ) : (
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-center text-sm text-gray-400">
              Google sign-in is not configured for this deployment.
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setShowPasswordLogin((current) => !current);
              setError("");
            }}
            className="w-full text-center text-sm text-gray-400 hover:text-amber-400 transition-colors"
          >
            {showPasswordLogin ? "Hide password login" : "Use password login"}
          </button>
        </div>

        {showPasswordLogin && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 border-t border-gray-800 pt-6">
            <div>
              <label htmlFor="username" className="block text-sm text-gray-400 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-gray-400 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 text-black font-semibold py-2.5 rounded-md transition-colors"
            >
              {loading
                ? "Please wait..."
                : isRegister && registrationEnabled
                  ? "Create Account"
                  : "Sign In"}
            </button>

            {registrationEnabled && (
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
                className="w-full text-center text-sm text-gray-400 hover:text-amber-400 transition-colors"
              >
                {isRegister
                  ? "Already have an account? Sign in"
                  : "Need an account? Register"}
              </button>
            )}
          </form>
        )}

        {error && (
          <p className="mt-4 text-red-400 text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
