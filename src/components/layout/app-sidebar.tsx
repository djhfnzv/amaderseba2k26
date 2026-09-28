"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/landing/logo";
import { startLogoutSplash } from "@/components/motion/login-splash";
import { NotificationBell, NotificationCenter } from "@/components/notifications/notification-center";
import { NavIconSvg, type NavIcon } from "./nav-icons";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Only highlight on an exact match (for dashboard roots). */
  exact?: boolean;
  /** Opens outside the dashboard (e.g. public pages). */
  external?: boolean;
};

type Props = {
  nav: NavItem[];
  userId: string;
  /** Dashboard home for this role: where the logo leads. */
  homeHref: string;
  unread: number;
  notificationsHref: string;
  userName: string;
  roleLabel: string;
};

function isActive(pathname: string, item: NavItem) {
  if (item.external) return false;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              target={item.external ? "_blank" : undefined}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <NavIconSvg
                name={item.icon}
                className={`size-5 shrink-0 ${active ? "text-teal-700" : "text-slate-400 group-hover:text-slate-600"}`}
              />
              <span className="flex-1">{item.label}</span>
              {item.external && <NavIconSvg name="external" className="size-4 text-slate-400" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Account({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const initials = userName
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800" aria-hidden="true">
        {initials || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
        <p className="text-xs text-slate-500">{roleLabel}</p>
      </div>
      <form action={signOut} onSubmit={() => startLogoutSplash()}>
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          Log out
        </button>
      </form>
    </div>
  );
}

/** Left sidebar on desktop; top bar + slide-out menu on phones and tablets. */
export function AppSidebar({ nav, userId, homeHref, unread, notificationsHref, userName, roleLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <NotificationCenter userId={userId} initialUnread={unread} href={notificationsHref}>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex print:hidden">
        <div className="flex h-16 items-center justify-between pr-3 pl-5">
          <Logo href={homeHref} />
          <NotificationBell align="left" />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <NavList nav={nav} />
        </nav>
        <div className="border-t border-slate-200 p-4">
          <Account userName={userName} roleLabel={roleLabel} />
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden print:hidden">
        <Logo href={homeHref} />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <span className="sr-only">Open menu</span>
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Slide-out menu */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-slate-900/30"
          />
          <div id="mobile-menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] animate-slide-in-left flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between px-4">
              <span className="contents" onClickCapture={() => setOpen(false)}>
                <Logo href={homeHref} />
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              >
                <span className="sr-only">Close menu</span>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
              <NavList nav={nav} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="border-t border-slate-200 p-4">
              <Account userName={userName} roleLabel={roleLabel} />
            </div>
          </div>
        </div>
      )}
    </NotificationCenter>
  );
}
