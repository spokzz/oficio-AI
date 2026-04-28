import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOutUser } from "@/app/actions/auth";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export function PortalShell({
  title,
  subtitle,
  eyebrow,
  nav,
  children,
  badge,
  topbarActions
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  nav: NavItem[];
  children: ReactNode;
  badge?: string;
  topbarActions?: ReactNode;
}) {
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <Link className="brand-lockup" href="/">
          <Image src="/brand/oficio-ai-mark.svg" alt="Oficio AI mark" width={48} height={48} priority />
          <div>
            <strong>Oficio AI</strong>
            <span>{badge ?? "Portal"}</span>
          </div>
        </Link>
        <nav className="portal-nav">
          {nav.map((item) => (
            <Link className={item.active ? "active" : ""} href={item.href} key={`${item.href}-${item.label}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={signOutUser}>
          <button className="sidebar-signout" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="portal-main">
        <div className="portal-topbar">
          <label className="search-shell" aria-label="Search">
            <span aria-hidden="true">Search</span>
            <input placeholder="Search customers, jobs, quotes" />
            <kbd>Cmd F</kbd>
          </label>
          <div className="topbar-actions">
            {topbarActions}
            <div className="profile-chip">
              <div className="avatar">AI</div>
              <div>
                <strong>Oficio Portal</strong>
                <span>{badge ?? "Workspace"}</span>
              </div>
            </div>
          </div>
        </div>
        <header className="portal-header">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p className="subcopy">{subtitle}</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
