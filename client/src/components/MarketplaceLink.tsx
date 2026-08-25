interface MarketplaceLinkProps {
  href: string | null;
  label: string;
  colorClass: string;
  className?: string;
}

export default function MarketplaceLink({ href, label, colorClass, className }: MarketplaceLinkProps) {
  const base = `text-xs rounded-md px-3 py-1.5 transition-colors ${className ?? ""}`;

  if (!href) {
    return (
      <button
        type="button"
        disabled
        aria-label={`${label} unavailable`}
        aria-disabled="true"
        title="Link not available"
        className={`${base} bg-gray-800/30 text-gray-600 border border-gray-700/30 cursor-not-allowed`}
      >
        {label}
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} border ${colorClass}`}
    >
      {label}
    </a>
  );
}
