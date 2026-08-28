import { useEffect, useState } from "react";
import type { UserProfile, UserProfileUpdate } from "../../types";

type ProfileFormProps = {
  profile: UserProfile;
  saving: boolean;
  canExposeContactFields?: boolean;
  onSubmit: (data: UserProfileUpdate) => void | Promise<void>;
};

const EMPTY_FORM: UserProfileUpdate = {
  displayName: null,
  countryOfResidence: null,
  instagram: null,
  instagramVisible: false,
  telegram: null,
  telegramVisible: false,
  facebook: null,
  facebookVisible: false,
  email: null,
  emailVisible: false,
  phoneNumber: null,
  phoneNumberVisible: false,
};

function value(value: string | null) {
  return value ?? "";
}

export default function ProfileForm({ profile, saving, canExposeContactFields = true, onSubmit }: ProfileFormProps) {
  const [form, setForm] = useState<UserProfileUpdate>({ ...EMPTY_FORM, ...profile });

  useEffect(() => {
    setForm({ ...EMPTY_FORM, ...profile });
  }, [profile]);

  const setText = (field: keyof UserProfileUpdate, next: string) => {
    setForm((current) => ({ ...current, [field]: next.trim().length > 0 ? next : null }));
  };

  const setVisible = (field: keyof UserProfileUpdate, checked: boolean) => {
    setForm((current) => ({ ...current, [field]: checked }));
  };

  const fieldClass = "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-amber-400";
  const checkboxClass = "h-4 w-4 rounded border-gray-700 bg-gray-950 text-amber-500 focus:ring-amber-400";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(canExposeContactFields ? form : {
          ...form,
          instagramVisible: false,
          telegramVisible: false,
          facebookVisible: false,
          emailVisible: false,
          phoneNumberVisible: false,
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-300">
          Display name
          <input className={fieldClass} value={value(form.displayName)} onChange={(e) => setText("displayName", e.target.value)} />
        </label>
        <label className="block text-sm text-gray-300">
          Country of residence
          <input className={fieldClass} value={value(form.countryOfResidence)} onChange={(e) => setText("countryOfResidence", e.target.value)} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ProfileTextField label="Instagram" visibleLabel="Show Instagram publicly" value={form.instagram} visible={form.instagramVisible} canExpose={canExposeContactFields} onValueChange={(next) => setText("instagram", next)} onVisibleChange={(next) => setVisible("instagramVisible", next)} fieldClass={fieldClass} checkboxClass={checkboxClass} />
        <ProfileTextField label="Telegram" visibleLabel="Show Telegram publicly" value={form.telegram} visible={form.telegramVisible} canExpose={canExposeContactFields} onValueChange={(next) => setText("telegram", next)} onVisibleChange={(next) => setVisible("telegramVisible", next)} fieldClass={fieldClass} checkboxClass={checkboxClass} />
        <ProfileTextField label="Facebook" visibleLabel="Show Facebook publicly" value={form.facebook} visible={form.facebookVisible} canExpose={canExposeContactFields} onValueChange={(next) => setText("facebook", next)} onVisibleChange={(next) => setVisible("facebookVisible", next)} fieldClass={fieldClass} checkboxClass={checkboxClass} />
        <ProfileTextField label="Email" visibleLabel="Show email publicly" value={form.email} visible={form.emailVisible} canExpose={canExposeContactFields} onValueChange={(next) => setText("email", next)} onVisibleChange={(next) => setVisible("emailVisible", next)} fieldClass={fieldClass} checkboxClass={checkboxClass} />
        <ProfileTextField label="HP number" visibleLabel="Show HP number publicly" value={form.phoneNumber} visible={form.phoneNumberVisible} canExpose={canExposeContactFields} onValueChange={(next) => setText("phoneNumber", next)} onVisibleChange={(next) => setVisible("phoneNumberVisible", next)} fieldClass={fieldClass} checkboxClass={checkboxClass} />
      </div>

      <p className="text-xs text-gray-500">Contact and social fields are private unless their public toggle is enabled. Public contact fields require a verified Google email.</p>

      <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60">
        {saving ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}

type ProfileTextFieldProps = {
  label: string;
  visibleLabel: string;
  value: string | null;
  visible: boolean;
  canExpose: boolean;
  onValueChange: (value: string) => void;
  onVisibleChange: (checked: boolean) => void;
  fieldClass: string;
  checkboxClass: string;
};

function ProfileTextField({ label, visibleLabel, value: fieldValue, visible, canExpose, onValueChange, onVisibleChange, fieldClass, checkboxClass }: ProfileTextFieldProps) {
  return (
    <div>
      <label className="block text-sm text-gray-300">
        {label}
        <input className={fieldClass} value={fieldValue ?? ""} onChange={(e) => onValueChange(e.target.value)} />
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" className={checkboxClass} checked={canExpose && visible} disabled={!canExpose} onChange={(e) => onVisibleChange(e.target.checked)} />
        {visibleLabel}
        {!canExpose && <span className="text-amber-300">Verify Google email first</span>}
      </label>
    </div>
  );
}
