"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Home,
  LogOut,
  MessagesSquare,
  Users,
  type LucideIcon
} from "lucide-react";
import { signOutUser } from "@/app/actions/auth";

type NavIcon = "bookings" | "customers" | "home" | "messages" | "quotes";

type NavItem = {
  label: string;
  href: string;
  icon?: NavIcon;
  active?: boolean;
};

const navIcons: Record<NavIcon, LucideIcon> = {
  bookings: CalendarDays,
  customers: Users,
  home: Home,
  messages: MessagesSquare,
  quotes: FileText
};

function NavItemIcon({ icon }: { icon?: NavIcon }) {
  if (!icon) return null;
  const Icon = navIcons[icon];

  return <Icon strokeWidth={2.2} />;
}

export function PortalShell({
  title,
  subtitle,
  eyebrow,
  dateLabel,
  nav,
  children,
  badge,
  searchLabel = "Search",
  searchPlaceholder = "Search customers, jobs, quotes",
  signOutLabel = "Sign out",
  topbarActions
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  dateLabel?: string;
  nav: NavItem[];
  children: ReactNode;
  badge?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  signOutLabel?: string;
  topbarActions?: ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={`portal-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="portal-sidebar">
        <div className="sidebar-brand-row">
          <Link className="brand-lockup" href="/">
            <Image src="/brand/oficio-ai-mark.svg" alt="Oficio AI mark" width={48} height={48} priority />
            <div>
              <strong>Oficio AI</strong>
              <span>{badge ?? "Portal"}</span>
            </div>
          </Link>
          <button
            aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="sidebar-collapse-toggle"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            {isSidebarCollapsed ? <ChevronsRight strokeWidth={2.25} /> : <ChevronsLeft strokeWidth={2.25} />}
          </button>
        </div>
        <nav className="portal-nav">
          {nav.map((item) => (
            <Link
              className={`${item.active ? "active" : ""} ${item.icon ? "has-icon" : ""}`.trim()}
              href={item.href}
              key={`${item.href}-${item.label}`}
              title={item.label}
            >
              <span aria-hidden="true" className="nav-icon">
                <NavItemIcon icon={item.icon} />
              </span>
              <span className="nav-label">{item.label}</span>
              <span aria-hidden="true" className="nav-fallback">
                {item.label.slice(0, 1)}
              </span>
            </Link>
          ))}
        </nav>
        <form action={signOutUser}>
          <button className="sidebar-signout" title={signOutLabel} type="submit">
            <span aria-hidden="true" className="signout-icon">
              <LogOut strokeWidth={2.2} />
            </span>
            <span className="signout-label">{signOutLabel}</span>
          </button>
        </form>
      </aside>
      <main className="portal-main">
        <div className="portal-topbar">
          <label className="search-shell" aria-label="Search">
            <span aria-hidden="true">{searchLabel}</span>
            <input placeholder={searchPlaceholder} />
            <kbd>Cmd F</kbd>
          </label>
          <div className="topbar-actions">
            {topbarActions}
          </div>
        </div>
        <header className="portal-header">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            {dateLabel ? <p className="portal-date">{dateLabel}</p> : null}
            <p className="subcopy">{subtitle}</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
