import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { PortalShell } from "@/components/layout/portal-shell";
import { getAdminPortalData } from "@/lib/admin-data";
import type { AdminTab } from "@/components/admin/admin-dashboard";

const adminTabs: Array<{ tab: AdminTab; label: string; href: string }> = [
  { tab: "overview", label: "Overview", href: "/admin" },
  { tab: "onboarding", label: "Onboarding", href: "/admin?tab=onboarding" },
  { tab: "accounts", label: "Accounts", href: "/admin?tab=accounts" },
  { tab: "phone", label: "Phone Setup", href: "/admin?tab=phone" },
  { tab: "usage", label: "Usage", href: "/admin?tab=usage" },
  { tab: "billing", label: "Billing", href: "/admin?tab=billing" },
  { tab: "playbook", label: "AI Playbook", href: "/admin?tab=playbook" }
];

type AdminPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

function getAdminTab(tab?: string): AdminTab {
  return adminTabs.some((item) => item.tab === tab) ? (tab as AdminTab) : "overview";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const data = await getAdminPortalData();
  const params = await searchParams;
  const activeTab = getAdminTab(params?.tab);

  return (
    <PortalShell
      badge="Admin console"
      eyebrow="Internal operations"
      nav={adminTabs.map((item) => ({
        label: item.label,
        href: item.href,
        active: item.tab === activeTab
      }))}
      subtitle="Set up owners, monitor accounts, tune AI behavior, and track manual billing."
      title={`Welcome, ${data.user.full_name?.split(" ")[0] ?? "Admin"}`}
    >
      <AdminDashboard activeTab={activeTab} data={data} />
    </PortalShell>
  );
}
