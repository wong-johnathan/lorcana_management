import { useState, useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { marketplace } from "../services/api";

const NAV_ICONS = {
  inventory: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  database: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  movers: "M3 17l6-6 4 4 8-8M14 7h7v7",
  masterSet: "M9 7h6m-6 4h6m-6 4h2m-5 6h10a2 2 0 002-2V5a2 2 0 00-2-2H8l-4 4v12a2 2 0 002 2z",
  marketplace: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  messages: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  login: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1",
};

interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  icon: string;
  badge?: number;
  ariaLabel?: string;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showTop, setShowTop] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Unread Messages badge (REQ-NOTIF-1/7): fetch on mount + every route change,
  // and re-fetch immediately when a thread is read or a message is sent (via the
  // custom `unread:refresh` window event). Fail-open: errors render no badge.
  useEffect(() => {
    if (!user) {
      setUnreadCount(null);
      return;
    }
    let active = true;
    const load = () => {
      marketplace
        .getUnreadCount()
        .then((response) => {
          if (active) setUnreadCount(response.count);
        })
        .catch(() => {
          if (active) setUnreadCount(null);
        });
    };
    load();

    const onRefresh = () => load();
    window.addEventListener("unread:refresh", onRefresh);
    return () => {
      active = false;
      window.removeEventListener("unread:refresh", onRefresh);
    };
  }, [user, location.pathname]);

  const scrollToTop = () => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  const navItems: NavItem[] = user
    ? [
        { to: "/inventory", label: "Inventory", icon: NAV_ICONS.inventory },
        { to: "/database", label: "Database", icon: NAV_ICONS.database },
        { to: "/marketplace", label: "Marketplace", shortLabel: "Market", icon: NAV_ICONS.marketplace },
        {
          to: "/marketplace/chat",
          label: "Messages",
          shortLabel: "Messages",
          icon: NAV_ICONS.messages,
          badge: unreadCount != null && unreadCount > 0 ? unreadCount : undefined,
          ariaLabel:
            unreadCount != null && unreadCount > 0
              ? `Messages, ${unreadCount} unread`
              : "Messages",
        },
        { to: "/market-movers", label: "Movers", icon: NAV_ICONS.movers },
        { to: "/master-set", label: "Master Set", shortLabel: "Master", icon: NAV_ICONS.masterSet },
      ]
    : [
        { to: "/database", label: "Database", icon: NAV_ICONS.database },
        { to: "/marketplace", label: "Marketplace", shortLabel: "Market", icon: NAV_ICONS.marketplace },
        { to: "/market-movers", label: "Movers", icon: NAV_ICONS.movers },
        { to: "/master-set", label: "Master Set", icon: NAV_ICONS.masterSet },
        { to: "/login", label: "Sign In", icon: NAV_ICONS.login },
      ];

  const navLinks = navItems.map(({ to, label, shortLabel, icon, badge, ariaLabel }) => (
    <NavLink
      key={to}
      to={to}
      aria-label={ariaLabel}
      className={({ isActive }) =>
        `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[10px] leading-none transition-colors ${
          isActive
            ? "text-amber-400"
            : "text-gray-400 hover:text-gray-200"
        } md:flex-none md:flex-row md:gap-1.5 md:px-3 md:text-sm md:leading-normal`
      }
    >
      <span className="relative">
        <svg
          className="w-6 h-6 md:w-5 md:h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        {badge != null && badge > 0 && (
          <span
            data-testid="messages-unread-badge"
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-gray-950"
          >
            {badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate md:hidden">{shortLabel ?? label}</span>
      <span className="hidden max-w-full truncate md:inline">{label}</span>
    </NavLink>
  ));

  return (
    <div className="flex app-frame flex-col overflow-hidden">
      <header className="shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-amber-400 hover:text-amber-300 transition-colors">Lorcana Inventory</Link>

        {/* Desktop nav — inline in header */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks}
          {user && (
            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-700">
              <Link to="/profile" className="text-sm text-gray-400 hover:text-amber-300 transition-colors">
                {user.username}
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Mobile: just show user/logout */}
        {user && (
          <div className="flex md:hidden items-center gap-3">
            <Link to="/profile" className="text-sm text-gray-400 hover:text-amber-300 transition-colors">
              {user.username}
            </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </header>

      <main ref={mainRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="shrink-0 bg-gray-900 border-t border-gray-800 md:hidden">
        <div className="flex max-w-lg mx-auto">
          {navLinks}
        </div>
      </nav>

      {showTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-4 md:bottom-6 z-40 w-10 h-10 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full flex items-center justify-center text-gray-300 hover:text-amber-400 shadow-lg transition-all"
          aria-label="Back to top"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}
    </div>
  );
}
