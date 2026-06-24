import { useState, useEffect } from "react";
import { settings as settingsApi } from "../services/api";
import type { UserSettings } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then(setSettings)
      .catch((err) => console.error("Failed to load settings:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await settingsApi.update({
        publicEnabled: !settings.publicEnabled,
      });
      setSettings(next);
    } catch (err) {
      console.error("Failed to update settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!settings) return;
    const url = `${window.location.origin}${settings.publicUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-red-400">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Public Collection</h3>
            <p className="text-sm text-gray-400 mt-1">
              Share a read-only view of your collection with anyone
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900 ${
              settings.publicEnabled ? "bg-amber-500" : "bg-gray-700"
            }`}
            role="switch"
            aria-checked={settings.publicEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.publicEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {settings.publicEnabled && (
          <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}${settings.publicUrl}`}
              className="flex-1 bg-transparent text-sm text-gray-300 outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
