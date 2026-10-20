import { useEffect, useState } from "react";

/** Tailwind `md` — the breakpoint where the full filter bar fits. */
export const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Subscribe to a CSS media query.
 *
 * Defaults to `true` when `matchMedia` is unavailable (SSR / jsdom) so the
 * desktop layout is the safe default and existing behaviour is unchanged.
 */
export function useMediaQuery(query: string): boolean {
  const read = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : true;

  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}
