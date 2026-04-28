import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { PortalShell } from "@/components/layout/portal-shell";
import { getAdminPortalData } from "@/lib/admin-data";

export default async function AdminPage() {
  const data = await getAdminPortalData();

  return (
    <PortalShell
      badge="Admin console"
      eyebrow="Internal operations"
      nav={[
        { label: "Overview", href: "/admin", active: true },
        { label: "Onboarding", href: "/admin" },
        { label: "Accounts", href: "/admin" },
        { label: "Usage", href: "/admin" },
        { label: "Billing", href: "/admin" },
        { label: "AI Playbook", href: "/admin" }
      ]}
      subtitle="Set up owners, monitor accounts, tune AI behavior, and track manual billing."
      title={`Welcome, ${data.user.full_name?.split(" ")[0] ?? "Admin"}`}
    >
      <AdminDashboard data={data} />
    </PortalShell>
  );
}

