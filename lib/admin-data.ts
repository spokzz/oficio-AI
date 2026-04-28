import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Business, ManualBillingAccount, UserProfile } from "@/lib/types";

export type AdminAccount = Business & {
  manual_billing_accounts?: ManualBillingAccount[] | null;
};

export type AdminPortalData = {
  user: UserProfile;
  accounts: AdminAccount[];
  totals: {
    businesses: number;
    live: number;
    onboarding: number;
    monthlyRevenue: number;
  };
};

export async function getAdminPortalData(): Promise<AdminPortalData> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id,email,full_name,phone,preferred_language,role")
    .eq("id", user.id)
    .single<UserProfile>();

  if (!profile || profile.role !== "platform_admin") redirect("/admin/login");

  const { data: accounts } = await supabase
    .from("businesses")
    .select("*, manual_billing_accounts(*)")
    .order("created_at", { ascending: false });

  const typedAccounts = (accounts ?? []) as AdminAccount[];
  const totals = {
    businesses: typedAccounts.length,
    live: typedAccounts.filter((account) => account.status === "live").length,
    onboarding: typedAccounts.filter((account) => account.status === "onboarding").length,
    monthlyRevenue: typedAccounts.reduce(
      (sum, account) => sum + Number(account.manual_billing_accounts?.[0]?.monthly_price ?? 0),
      0
    )
  };

  return {
    user: profile,
    accounts: typedAccounts,
    totals
  };
}
