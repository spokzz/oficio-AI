import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Business, BusinessAvailabilityException, ManualBillingAccount, ServiceRadiusRule, UserProfile } from "@/lib/types";

export type AdminAccount = Business & {
  business_availability_exceptions?: BusinessAvailabilityException[] | null;
  manual_billing_accounts?: ManualBillingAccount[] | null;
  service_radius_rules?: ServiceRadiusRule[] | null;
  owners: UserProfile[];
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
    .select("*, business_availability_exceptions(*), manual_billing_accounts(*), service_radius_rules(*)")
    .order("created_at", { ascending: false });

  const baseAccounts = (accounts ?? []) as Array<
    Business & {
      business_availability_exceptions?: BusinessAvailabilityException[] | null;
      manual_billing_accounts?: ManualBillingAccount[] | null;
      service_radius_rules?: ServiceRadiusRule[] | null;
    }
  >;
  const businessIds = baseAccounts.map((account) => account.id);
  const ownersByBusiness = new Map<string, UserProfile[]>();

  if (businessIds.length) {
    const { data: memberships } = await supabase
      .from("business_users")
      .select("business_id,user_id")
      .in("business_id", businessIds)
      .eq("role", "owner");

    const ownerIds = Array.from(new Set((memberships ?? []).map((membership) => String(membership.user_id))));

    if (ownerIds.length) {
      const { data: owners } = await supabase
        .from("users")
        .select("id,email,full_name,phone,preferred_language,role")
        .in("id", ownerIds);
      const ownersById = new Map((owners ?? []).map((owner) => [owner.id, owner as UserProfile]));

      for (const membership of memberships ?? []) {
        const owner = ownersById.get(String(membership.user_id));
        if (!owner) continue;

        const businessOwners = ownersByBusiness.get(String(membership.business_id)) ?? [];
        businessOwners.push(owner);
        ownersByBusiness.set(String(membership.business_id), businessOwners);
      }
    }
  }

  const typedAccounts: AdminAccount[] = baseAccounts.map((account) => ({
    ...account,
    owners: ownersByBusiness.get(account.id) ?? []
  }));
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
