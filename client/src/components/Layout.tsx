import { useState, useEffect, useRef } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./notifications/NotificationBell";
import NotificationToast from "./notifications/NotificationToast";
import { useNotifications } from "../hooks/useNotifications";

const NAV_ICONS = {
  inventory: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  extras: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2 1.343-2 3-2zm0 0V4m0 16v-4m8-4h-4M8 12H4",
  database: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  masterSet: "M9 7h6m-6 4h6m-6 4h2m-5 6h10a2 2 0 002-2V5a2 2 0 00-2-2H8l-4 4v12a2 2 0 002 2z",
  marketplace: "M3 7h18M5 7l1.5 12h11L19 7M8 7V5a4 4 0 018 0v2",
  messages: "M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  login: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const [showTop, setShowTop] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    toastNotification,
    markAsRead,
    markAllAsRead,
    clearToast,
  } = useNotifications({ enabled: Boolean(user) });

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  const navItems = user
    ? [
        { to: "/inventory", label: "Inventory", icon: NAV_ICONS.inventory },
        { to: "/extras-for-sale", label: "Extras", icon: NAV_ICONS.extras },
        { to: "/database", label: "Database", icon: NAV_ICONS.database },
        { to: "/marketplace", label: "Marketplace", icon: NAV_ICONS.marketplace },
        { to: "/marketplace/enquiries", label: "Messages", icon: NAV_ICONS.messages },
        { to: "/master-set", label: "Master Set", icon: NAV_ICONS.masterSet },
      ]
    : [
        { to: "/database", label: "Database", icon: NAV_ICONS.database },
        { to: "/marketplace", label: "Marketplace", icon: NAV_ICONS.marketplace },
        { to: "/master-set", label: "Master Set", icon: NAV_ICONS.masterSet },
        { to: "/login", label: "Sign In", icon: NAV_ICONS.login },
      ];

  const navLinks = navItems.map(({ to, label, icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-1.5 py-2 px-3 text-xs transition-colors ${
          isActive
            ? "text-amber-400"
            : "text-gray-400 hover:text-gray-200"
        } md:flex-row md:text-sm`
      }
    >
      <svg
        className="w-6 h-6 md:w-5 md:h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="md:inline">{label}</span>
    </NavLink>
  ));

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-amber-400 hover:text-amber-300 transition-colors">Lorcana Inventory</Link>

        {/* Desktop nav — inline in header */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks}
          {user && (
            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-700">
              <NotificationBell
                notifications={notifications}
                unreadCount={unreadCount}
                loading={notificationsLoading}
                onMarkAsRead={markAsRead}
                onMarkAllAsRead={markAllAsRead}
              />
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
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              loading={notificationsLoading}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
            />
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
        <div className="flex justify-around max-w-lg mx-auto">
          {navLinks}
        </div>
      </nav>

      <NotificationToast
        notification={toastNotification}
        onOpen={markAsRead}
        onDismiss={clearToast}
      />

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
