import { useState } from "react";
import type { UserReference } from "../../types";

type ReferenceDraft = Omit<UserReference, "id">;

type UserReferencesEditorProps = {
  references: UserReference[];
  saving: boolean;
  onCreate: (data: ReferenceDraft) => void | Promise<void>;
  onUpdate: (id: string, data: Partial<ReferenceDraft>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

const EMPTY_DRAFT: ReferenceDraft = {
  name: "",
  description: null,
  contactInfo: null,
  visible: false,
};

export default function UserReferencesEditor({ references, saving, onCreate, onUpdate, onDelete }: UserReferencesEditorProps) {
  const [draft, setDraft] = useState<ReferenceDraft>(EMPTY_DRAFT);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    await onCreate({
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      contactInfo: draft.contactInfo?.trim() || null,
      visible: draft.visible,
    });
    setDraft(EMPTY_DRAFT);
  };

  const fieldClass = "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-amber-400";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-gray-100">User-provided references</h3>
        <p className="mt-1 text-sm text-gray-400">Optional contacts or notes that can help other collectors verify you. This is not platform verification.</p>
      </div>

      <div className="space-y-2">
        {references.length === 0 ? (
          <p className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-500">No references added.</p>
        ) : references.map((reference) => (
          <div key={reference.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-gray-100">{reference.name}</p>
                {reference.description && <p className="text-sm text-gray-400">{reference.description}</p>}
                {reference.contactInfo && <p className="text-sm text-gray-500">{reference.contactInfo}</p>}
                <p className="mt-1 text-xs text-gray-500">{reference.visible ? "Visible publicly" : "Private"}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => onUpdate(reference.id, { visible: !reference.visible })} disabled={saving} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-amber-400">
                  {reference.visible ? `Hide ${reference.name}` : `Show ${reference.name}`}
                </button>
                <button type="button" onClick={() => onDelete(reference.id)} disabled={saving} className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:border-red-500">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form className="grid gap-3 rounded-lg border border-gray-800 bg-gray-900 p-3" onSubmit={submit}>
        <label className="text-sm text-gray-300">
          Reference name
          <input className={fieldClass} value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} />
        </label>
        <label className="text-sm text-gray-300">
          Relationship / description
          <input className={fieldClass} value={draft.description ?? ""} onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))} />
        </label>
        <label className="text-sm text-gray-300">
          Contact method or note
          <input className={fieldClass} value={draft.contactInfo ?? ""} onChange={(e) => setDraft((current) => ({ ...current, contactInfo: e.target.value }))} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" checked={draft.visible} onChange={(e) => setDraft((current) => ({ ...current, visible: e.target.checked }))} />
          Show this reference publicly
        </label>
        <button type="submit" disabled={saving || !draft.name.trim()} className="w-fit rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-gray-700 disabled:opacity-60">
          Add reference
        </button>
      </form>
    </div>
  );
}
