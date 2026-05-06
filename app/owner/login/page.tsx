import { requestPasswordReset, signInOwner } from "@/app/actions/auth";
import { LoginCard } from "@/components/auth/login-card";

type OwnerLoginPageProps = {
  searchParams?: Promise<{
    reset?: string;
  }>;
};

export default async function OwnerLoginPage({ searchParams }: OwnerLoginPageProps) {
  const params = await searchParams;

  return (
    <LoginCard
      action={signInOwner}
      notice={params?.reset === "success" ? "Your password was updated. Sign in with the new password." : undefined}
      resetAction={requestPasswordReset}
    />
  );
}
