import { requestPasswordReset, signInAdmin } from "@/app/actions/auth";
import { LoginCard } from "@/components/auth/login-card";

type AdminLoginPageProps = {
  searchParams?: Promise<{
    reset?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = await searchParams;

  return (
    <LoginCard
      action={signInAdmin}
      eyebrow="Internal admin"
      helper="Admin access requires your public.users.role to be platform_admin."
      notice={params?.reset === "success" ? "Your password was updated. Sign in with the new password." : undefined}
      resetAction={requestPasswordReset}
      submitLabel="Open admin console"
      subtitle="Onboard businesses, monitor usage, tune AI playbooks, and track manual billing."
      title="Sign in to Oficio Admin"
      variant="admin"
    />
  );
}
