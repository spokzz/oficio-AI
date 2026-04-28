import { signInAdmin } from "@/app/actions/auth";
import { LoginCard } from "@/components/auth/login-card";

export default function AdminLoginPage() {
  return (
    <LoginCard
      action={signInAdmin}
      eyebrow="Internal admin"
      helper="Admin access requires your public.users.role to be platform_admin."
      submitLabel="Open admin console"
      subtitle="Onboard businesses, monitor usage, tune AI playbooks, and track manual billing."
      title="Sign in to Oficio Admin"
      variant="admin"
    />
  );
}
