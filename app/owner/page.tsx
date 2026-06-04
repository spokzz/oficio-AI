import { PortalShell } from "@/components/layout/portal-shell";
import { OwnerDashboard } from "@/components/owner/owner-dashboard";
import { getOwnerPortalData } from "@/lib/owner-data";
import { createCsrfToken } from "@/lib/csrf";
import Link from "next/link";

type OwnerLanguage = "es" | "en";
type OwnerTab = "home" | "bookings" | "customers" | "quotes" | "messages" | "settings";

const ownerTabs: OwnerTab[] = ["home", "bookings", "customers", "quotes", "messages", "settings"];

type OwnerPageProps = {
  searchParams?: Promise<{
    lang?: string;
    tab?: string;
  }>;
};

const ownerShellCopy = {
  es: {
    badge: "Portal dueño",
    greeting: {
      morning: "Buenos días",
      afternoon: "Buenas tardes",
      evening: "Buenas noches"
    },
    nav: {
      home: "Inicio",
      bookings: "Reservas",
      customers: "Clientes",
      quotes: "Cotizaciones",
      messages: "Mensajes",
      settings: "Configuración"
    },
    signOut: "Cerrar sesión",
    subtitle: "Tu recepcionista AI está tomando llamadas, textos y solicitudes de cotización."
  },
  en: {
    badge: "Owner portal",
    greeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening"
    },
    nav: {
      home: "Home",
      bookings: "Bookings",
      customers: "Customers",
      quotes: "Quotes",
      messages: "Messages",
      settings: "Settings"
    },
    signOut: "Sign out",
    subtitle: "Your AI receptionist is taking calls, texts, and quote requests."
  }
};

const languageLabels = {
  en: "English",
  es: "Español"
} as const;

function currentGreeting(language: OwnerLanguage) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Chicago"
    }).format(new Date())
  );
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return ownerShellCopy[language].greeting[period];
}

function currentDateLabel(language: OwnerLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-US", {
    day: "numeric",
    month: "long",
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric"
  }).format(new Date());
}

function getOwnerTab(tab?: string): OwnerTab {
  return ownerTabs.includes(tab as OwnerTab) ? (tab as OwnerTab) : "home";
}

function ownerHref(language: OwnerLanguage, tab: OwnerTab) {
  const params = new URLSearchParams({ lang: language });

  if (tab !== "home") {
    params.set("tab", tab);
  }

  return `/owner?${params.toString()}`;
}

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const params = await searchParams;
  const language: OwnerLanguage = params?.lang === "es" ? "es" : "en";
  const data = await getOwnerPortalData(language);
  const activeTab = getOwnerTab(params?.tab);
  const copy = ownerShellCopy[language];
  const firstName = data.user.full_name?.split(" ")[0] ?? (language === "en" ? "Owner" : "Dueño");
  const csrfToken = createCsrfToken(data.user.id);

  return (
    <PortalShell
      badge={copy.badge}
      dateLabel={currentDateLabel(language)}
      eyebrow={data.business.name}
      headerPlacement={activeTab === "home" ? "topbar" : "none"}
      nav={[
        { label: copy.nav.home, href: ownerHref(language, "home"), icon: "home", active: activeTab === "home" },
        { label: copy.nav.bookings, href: ownerHref(language, "bookings"), icon: "bookings", active: activeTab === "bookings" },
        { label: copy.nav.customers, href: ownerHref(language, "customers"), icon: "customers", active: activeTab === "customers" },
        { label: copy.nav.quotes, href: ownerHref(language, "quotes"), icon: "quotes", active: activeTab === "quotes" },
        { label: copy.nav.messages, href: ownerHref(language, "messages"), icon: "messages", active: activeTab === "messages" },
        { label: copy.nav.settings, href: ownerHref(language, "settings"), icon: "settings", active: activeTab === "settings" }
      ]}
      showSearch={false}
      signOutLabel={copy.signOut}
      subtitle={copy.subtitle}
      topbarActions={
        activeTab === "home" ? (
          <div className="language-toggle portal-language-toggle" role="group" aria-label="Language">
            <Link className={language === "es" ? "active" : ""} href={ownerHref("es", activeTab)}>
              {languageLabels.es}
            </Link>
            <Link className={language === "en" ? "active" : ""} href={ownerHref("en", activeTab)}>
              {languageLabels.en}
            </Link>
          </div>
        ) : null
      }
      title={`${currentGreeting(language)}, ${firstName}`}
    >
      <OwnerDashboard csrfToken={csrfToken} data={data} initialLanguage={language} initialTab={activeTab} key={`${language}-${activeTab}`} />
    </PortalShell>
  );
}
