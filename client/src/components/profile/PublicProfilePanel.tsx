import type { PublicUserProfile } from "../../types";

type PublicProfilePanelProps = {
  profile?: PublicUserProfile | null;
  username: string;
};

function hasProfile(profile?: PublicUserProfile | null): profile is PublicUserProfile {
  if (!profile) return false;
  return Object.entries(profile).some(([key, value]) => key !== "references" && Boolean(value)) || Boolean(profile.references?.length);
}

function externalLink(value: string, kind: "instagram" | "telegram" | "facebook" | "email" | "phone") {
  if (kind === "instagram") return value.startsWith("http") ? value : `https://instagram.com/${value.replace(/^@/, "")}`;
  if (kind === "telegram") return value.startsWith("http") ? value : `https://t.me/${value.replace(/^@/, "")}`;
  if (kind === "facebook") return value.startsWith("http") ? value : `https://facebook.com/${value}`;
  if (kind === "email") return `mailto:${value}`;
  return `tel:${value}`;
}

export default function PublicProfilePanel({ profile, username }: PublicProfilePanelProps) {
  if (!hasProfile(profile)) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
          {username} has not shared profile information.
        </div>
      </div>
    );
  }

  const title = profile.displayName || username;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-6">
        <div className="flex items-center gap-4">
          {profile.profileImageUrl ? (
            <img src={profile.profileImageUrl} alt={`${title} profile`} className="h-20 w-20 rounded-full object-cover border border-gray-700" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-gray-700 bg-gray-950 text-xl text-gray-500">
              {title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-gray-100">{title}</h2>
            {profile.countryOfResidence && <p className="text-sm text-gray-400">{profile.countryOfResidence}</p>}
            <p className="mt-1 text-xs text-gray-500">User-provided profile information</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {profile.instagram && <ProfileLink label="Instagram" href={externalLink(profile.instagram, "instagram")} value={profile.instagram} />}
          {profile.telegram && <ProfileLink label="Telegram" href={externalLink(profile.telegram, "telegram")} value={profile.telegram} />}
          {profile.facebook && <ProfileLink label="Facebook" href={externalLink(profile.facebook, "facebook")} value={profile.facebook} />}
          {profile.email && <ProfileLink label="Email" href={externalLink(profile.email, "email")} value={profile.email} />}
          {profile.phoneNumber && <ProfileLink label="HP" href={externalLink(profile.phoneNumber, "phone")} value={profile.phoneNumber} />}
        </div>

        {profile.references && profile.references.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-medium text-gray-100">User-provided references</h3>
            <div className="grid gap-3">
              {profile.references.map((reference) => (
                <div key={reference.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                  <p className="font-medium text-gray-100">{reference.name}</p>
                  {reference.description && <p className="text-sm text-gray-400">{reference.description}</p>}
                  {reference.contactInfo && <p className="text-sm text-gray-500">{reference.contactInfo}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ProfileLink({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <a aria-label={label} href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-800 bg-gray-950 p-3 transition hover:border-amber-400">
      <span className="block text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="mt-1 block truncate text-sm text-amber-300">{value}</span>
    </a>
  );
}
