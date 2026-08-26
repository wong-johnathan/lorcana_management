import { useState } from "react";
import type { ProfileImageUpload } from "../../types";

type ProfileImageUploaderProps = {
  profileImageUrl: string | null;
  uploading: boolean;
  onUpload: (payload: ProfileImageUpload) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export default function ProfileImageUploader({ profileImageUrl, uploading, onUpload, onDelete }: ProfileImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ProfileImageUpload["contentType"] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const currentImage = preview || profileImageUrl;

  const handleFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, or WebP images are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile picture must be 5MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      setContentType(file.type as ProfileImageUpload["contentType"]);
      setZoom(1);
      setRotation(0);
      setOffsetX(0);
      setOffsetY(0);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!preview || !contentType) return;
    await onUpload({ dataUrl: preview, contentType });
    setPreview(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 overflow-hidden rounded-full border border-gray-700 bg-gray-950">
          {currentImage ? (
            <img
              src={currentImage}
              alt="Profile preview"
              className="h-full w-full object-cover"
              style={{ transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${zoom})` }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">No photo</div>
          )}
        </div>
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-amber-400">
            Upload profile picture
            <input
              aria-label="Upload profile picture"
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </label>
          {profileImageUrl && !preview && (
            <button type="button" onClick={onDelete} disabled={uploading} className="block text-sm text-red-300 hover:text-red-200">
              Remove picture
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {preview && (
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-3">
          <h4 className="text-sm font-medium text-gray-200">Edit profile picture</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-400">
              Zoom
              <input aria-label="Zoom profile picture" className="mt-1 w-full" type="range" min="1" max="2" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <label className="text-xs text-gray-400">
              Horizontal crop
              <input aria-label="Move profile picture horizontally" className="mt-1 w-full" type="range" min="-24" max="24" value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))} />
            </label>
            <label className="text-xs text-gray-400">
              Vertical crop
              <input aria-label="Move profile picture vertically" className="mt-1 w-full" type="range" min="-24" max="24" value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} />
            </label>
            <button type="button" aria-label="Rotate right" onClick={() => setRotation((current) => current + 90)} className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-amber-400">
              Rotate right
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={uploading} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60">
              {uploading ? "Saving..." : "Save picture"}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
