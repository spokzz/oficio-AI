import { PortalShell } from "@/components/layout/portal-shell";
import { OwnerDashboard } from "@/components/owner/owner-dashboard";
import { getOwnerPortalData } from "@/lib/owner-data";
import Link from "next/link";

type OwnerLanguage = "es" | "en";

type OwnerPageProps = {
  searchParams?: Promise<{
    lang?: string;
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
      settings: "Ajustes"
    },
    searchLabel: "Buscar",
    searchPlaceholder: "Buscar clientes, trabajos, cotizaciones",
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
    searchLabel: "Search",
    searchPlaceholder: "Search customers, jobs, quotes",
    signOut: "Sign out",
    subtitle: "Your AI receptionist is taking calls, texts, and quote requests."
  }
};

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

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const data = await getOwnerPortalData();
  const params = await searchParams;
  const language: OwnerLanguage = params?.lang === "en" ? "en" : "es";
  const copy = ownerShellCopy[language];
  const langQuery = `?lang=${language}`;
  const firstName = data.user.full_name?.split(" ")[0] ?? (language === "en" ? "Owner" : "Dueño");

  return (
    <PortalShell
      badge={copy.badge}
      eyebrow={data.business.name}
      nav={[
        { label: copy.nav.home, href: `/owner${langQuery}`, active: true },
        { label: copy.nav.bookings, href: `/owner${langQuery}` },
        { label: copy.nav.customers, href: `/owner${langQuery}` },
        { label: copy.nav.quotes, href: `/owner${langQuery}` },
        { label: copy.nav.messages, href: `/owner${langQuery}` },
        { label: copy.nav.settings, href: `/owner${langQuery}` }
      ]}
      searchLabel={copy.searchLabel}
      searchPlaceholder={copy.searchPlaceholder}
      signOutLabel={copy.signOut}
      subtitle={copy.subtitle}
      topbarActions={
        <div className="language-toggle portal-language-toggle" role="group" aria-label="Language">
          <Link className={language === "es" ? "active" : ""} href="/owner?lang=es">
            Español
          </Link>
          <Link className={language === "en" ? "active" : ""} href="/owner?lang=en">
            English
          </Link>
        </div>
      }
      title={`${currentGreeting(language)}, ${firstName}`}
    >
      <OwnerDashboard data={data} initialLanguage={language} key={language} />
    </PortalShell>
  );
}
