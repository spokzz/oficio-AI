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
      notice={params?.reset === "success" ? "Your password was updated. Sign in with the new password." : undefined}
      resetAction={requestPasswordReset}
      variant="admin"
    />
  );
}
