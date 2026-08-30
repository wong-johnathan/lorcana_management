import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { inventory as inventoryApi, profile as profileApi, settings as settingsApi } from "../services/api";
import type { InventoryPolicy, ProfileImageUpload, UserProfile, UserProfileUpdate, UserReference, UserSettings } from "../types";
import ProfileForm from "../components/profile/ProfileForm";
import ProfileImageUploader from "../components/profile/ProfileImageUploader";
import UserReferencesEditor from "../components/profile/UserReferencesEditor";
import AccountSettingsPanel from "../components/profile/AccountSettingsPanel";
import ExtrasSettingsPanel from "../components/extras/ExtrasSettingsPanel";
import { useAuth } from "../context/AuthContext";

export default function SettingsPage() {
  const { user, googleClientId, linkGoogleAccount, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [extrasPolicy, setExtrasPolicy] = useState<InventoryPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([settingsApi.get(), profileApi.get(), inventoryApi.getPolicy()])
      .then(([nextSettings, nextProfile, nextPolicy]) => {
        setSettings(nextSettings);
        setProfile(nextProfile);
        setExtrasPolicy(nextPolicy);
      })
      .catch((err) => setError(err?.message || "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    if (!settings) return;
    if (!settings.publicEnabled && !user?.emailVerifiedAt) {
      setError("Verify your Google email before publishing your profile.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await settingsApi.update({ publicEnabled: !settings.publicEnabled });
      setSettings(next);
    } catch (err: any) {
      setError(err?.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSave = async (data: UserProfileUpdate) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await profileApi.update(data);
      setProfile(next);
      setSuccess("Profile saved");
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleExtrasPolicySave = async (data: InventoryPolicy) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      setExtrasPolicy(await inventoryApi.updatePolicy(data));
      setSuccess("Extras for Sale settings saved");
    } catch (err: any) {
      setError(err?.message || "Failed to save Extras for Sale settings");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (payload: ProfileImageUpload) => {
    setUploading(true);
    setError(null);
    try {
      const next = await profileApi.uploadPhoto(payload);
      setProfile(next);
      setSuccess("Profile picture saved");
    } catch (err: any) {
      setError(err?.message || "Failed to upload profile picture");
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoDelete = async () => {
    setUploading(true);
    setError(null);
    try {
      await profileApi.deletePhoto();
      setProfile((current) => current ? { ...current, profileImageUrl: null, profileImageObjectKey: null } : current);
    } catch (err: any) {
      setError(err?.message || "Failed to delete profile picture");
    } finally {
      setUploading(false);
    }
  };

  const refreshReference = (reference: UserReference) => {
    setProfile((current) => current ? {
      ...current,
      references: current.references.some((item) => item.id === reference.id)
        ? current.references.map((item) => item.id === reference.id ? reference : item)
        : [...current.references, reference],
    } : current);
  };

  const handleReferenceCreate = async (data: Omit<UserReference, "id">) => {
    setSaving(true);
    setError(null);
    try {
      refreshReference(await profileApi.createReference(data));
    } catch (err: any) {
      setError(err?.message || "Failed to add reference");
    } finally {
      setSaving(false);
    }
  };

  const handleReferenceUpdate = async (id: string, data: Partial<Omit<UserReference, "id">>) => {
    setSaving(true);
    setError(null);
    try {
      refreshReference(await profileApi.updateReference(id, data));
    } catch (err: any) {
      setError(err?.message || "Failed to update reference");
    } finally {
      setSaving(false);
    }
  };

  const handleReferenceDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await profileApi.deleteReference(id);
      setProfile((current) => current ? { ...current, references: current.references.filter((reference) => reference.id !== id) } : current);
    } catch (err: any) {
      setError(err?.message || "Failed to delete reference");
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

  const handleLinkGoogle = async (credential: string) => {
    setLinkingGoogle(true);
    setError(null);
    setSuccess(null);
    try {
      await linkGoogleAccount(credential);
      setSuccess("Google account linked");
    } catch (err: any) {
      setError(err?.message || "Failed to link Google account");
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleDeleteAccount = async (confirmUsername: string, confirmText: string) => {
    setDeletingAccount(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAccount(confirmUsername, confirmText);
      navigate("/login", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Failed to delete account");
      setDeletingAccount(false);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!settings || !profile || !extrasPolicy) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-red-400">{error || "Failed to load settings"}</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h2 className="text-lg font-semibold">Profile Settings</h2>
      <div className={`rounded-lg border p-3 text-sm ${user?.emailVerifiedAt ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : "border-amber-900 bg-amber-950/30 text-amber-200"}`}>
        {user?.emailVerifiedAt
          ? `Email verified${user.email ? `: ${user.email}` : ""}`
          : "Verify your Google email before publishing your collection, contact fields, references, or Extras for Sale."}
      </div>
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</div>}

      {user && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <AccountSettingsPanel
            user={user}
            googleClientId={googleClientId}
            linking={linkingGoogle}
            deleting={deletingAccount}
            onLinkGoogle={handleLinkGoogle}
            onDeleteAccount={handleDeleteAccount}
          />
        </div>
      )}

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Public Collection</h3>
            <p className="text-sm text-gray-400 mt-1">Share a read-only view of your collection with anyone</p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving || (!settings.publicEnabled && !user?.emailVerifiedAt)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900 ${settings.publicEnabled ? "bg-amber-500" : "bg-gray-700"}`}
            role="switch"
            aria-checked={settings.publicEnabled}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.publicEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {settings.publicEnabled && (
          <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
            <input type="text" readOnly value={`${window.location.origin}${settings.publicUrl}`} className="flex-1 bg-transparent text-sm text-gray-300 outline-none truncate" />
            <button onClick={handleCopy} className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap">
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
        <ExtrasSettingsPanel
          policy={extrasPolicy}
          saving={saving}
          publicEnabled={settings.publicEnabled}
          showManageLink
          onSave={handleExtrasPolicySave}
        />
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
        <div>
          <h3 className="font-medium">Profile picture</h3>
          <p className="mt-1 text-sm text-gray-400">Crop, zoom, rotate, and preview before saving. Edited images are uploaded through the object storage layer.</p>
        </div>
        <ProfileImageUploader profileImageUrl={profile.profileImageUrl} uploading={uploading} onUpload={handlePhotoUpload} onDelete={handlePhotoDelete} />
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-4">
        <div>
          <h3 className="font-medium">Public profile information</h3>
          <p className="mt-1 text-sm text-gray-400">All fields are optional. Private fields never appear on shared collection links.</p>
        </div>
        <ProfileForm profile={profile} saving={saving} canExposeContactFields={Boolean(user?.emailVerifiedAt)} onSubmit={handleProfileSave} />
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <UserReferencesEditor references={profile.references} saving={saving} canExposeReferences={Boolean(user?.emailVerifiedAt)} onCreate={handleReferenceCreate} onUpdate={handleReferenceUpdate} onDelete={handleReferenceDelete} />
      </div>
    </div>
  );
}
