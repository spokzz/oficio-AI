import { PortalShell } from "@/components/layout/portal-shell";
import { OwnerDashboard } from "@/components/owner/owner-dashboard";
import { getOwnerPortalData } from "@/lib/owner-data";
import Link from "next/link";

type OwnerPageProps = {
  searchParams?: Promise<{
    lang?: string;
  }>;
};

export default async function OwnerPage({ searchParams }: OwnerPageProps) {
  const data = await getOwnerPortalData();
  const params = await searchParams;
  const language = params?.lang === "en" ? "en" : "es";

  return (
    <PortalShell
      badge="Owner portal"
      eyebrow={data.business.name}
      nav={[
        { label: "Inicio", href: "/owner", active: true },
        { label: "Reservas", href: "/owner" },
        { label: "Clientes", href: "/owner" },
        { label: "Cotizaciones", href: "/owner" },
        { label: "Mensajes", href: "/owner" },
        { label: "Ajustes", href: "/owner" }
      ]}
      subtitle="Tu recepcionista AI está tomando llamadas, textos y solicitudes de cotización."
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
      title={`Buenas tardes, ${data.user.full_name?.split(" ")[0] ?? "Owner"}`}
    >
      <OwnerDashboard data={data} initialLanguage={language} key={language} />
    </PortalShell>
  );
}
