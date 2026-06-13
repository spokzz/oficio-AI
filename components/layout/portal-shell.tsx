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
  Settings,
  Users,
  type LucideIcon
} from "lucide-react";
import { signOutUser } from "@/app/actions/auth";

type NavIcon = "bookings" | "customers" | "home" | "messages" | "quotes" | "settings";

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
  quotes: FileText,
  settings: Settings
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
  headerPlacement = "below",
  searchLabel = "Search",
  searchPlaceholder = "Search customers, jobs, quotes",
  showSearch = true,
  signOutLabel = "Sign out",
  signOutRedirectTo = "/owner/login",
  topbarActions
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  dateLabel?: string;
  nav: NavItem[];
  children: ReactNode;
  badge?: string;
  headerPlacement?: "below" | "none" | "topbar";
  searchLabel?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  signOutLabel?: string;
  signOutRedirectTo?: string;
  topbarActions?: ReactNode;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const shouldShowSearch = headerPlacement !== "topbar" && showSearch;
  const shouldShowTopbar = headerPlacement === "topbar" || shouldShowSearch || Boolean(topbarActions);
  const mobileNav = nav.filter((item) => item.icon !== "quotes");
  const isSettingsActive = nav.some((item) => item.icon === "settings" && item.active);
  const headerContent = (
    <div className="portal-heading">
      <div className="portal-heading-meta">
        <div className="eyebrow">{eyebrow}</div>
        {dateLabel ? <p className="portal-date">{dateLabel}</p> : null}
      </div>
      <h1>{title}</h1>
      <p className="subcopy">{subtitle}</p>
    </div>
  );

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
          <input name="redirectTo" type="hidden" value={signOutRedirectTo} />
          <button className="sidebar-signout" title={signOutLabel} type="submit">
            <span aria-hidden="true" className="signout-icon">
              <LogOut strokeWidth={2.2} />
            </span>
            <span className="signout-label">{signOutLabel}</span>
          </button>
        </form>
      </aside>
      <main className="portal-main">
        <div className="mobile-portal-header">
          <div className="mobile-portal-identity">
            <Link className="mobile-brand-lockup" href="/">
              <Image src="/brand/oficio-ai-mark.svg" alt="Oficio AI mark" width={36} height={36} priority />
              <strong>Oficio AI</strong>
            </Link>
            <span>{eyebrow}</span>
          </div>
          {topbarActions ? <div className="mobile-header-actions">{topbarActions}</div> : null}
        </div>
        {shouldShowTopbar ? (
          <div className={`portal-topbar ${headerPlacement === "topbar" ? "with-header" : ""}`}>
            {headerPlacement === "topbar" ? (
              <div className="topbar-header">{headerContent}</div>
            ) : shouldShowSearch ? (
              <label className="search-shell" aria-label="Search">
                <span aria-hidden="true">{searchLabel}</span>
                <input placeholder={searchPlaceholder} />
                <kbd>Cmd F</kbd>
              </label>
            ) : null}
            {topbarActions ? <div className="topbar-actions">{topbarActions}</div> : null}
          </div>
        ) : null}
        {headerPlacement === "below" ? <header className="portal-header">{headerContent}</header> : null}
        {children}
        {isSettingsActive ? (
          <form action={signOutUser} className="mobile-settings-signout">
            <input name="redirectTo" type="hidden" value={signOutRedirectTo} />
            <button className="button ghost" type="submit">
              <LogOut strokeWidth={2.2} />
              <span>{signOutLabel}</span>
            </button>
          </form>
        ) : null}
      </main>
      <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
        {mobileNav.map((item) => (
          <Link className={item.active ? "active" : ""} href={item.href} key={`mobile-${item.href}-${item.label}`}>
            <span aria-hidden="true" className="mobile-bottom-nav-icon">
              <NavItemIcon icon={item.icon} />
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
