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
      eyebrow="Owner portal"
      helper="Use the email and password created for your business account in Supabase Auth."
      notice={params?.reset === "success" ? "Your password was updated. Sign in with the new password." : undefined}
      resetAction={requestPasswordReset}
      submitLabel="Open my dashboard"
      subtitle="Answer customers in any language, receive Spanish summaries, and manage bookings from one clean dashboard."
      title="Welcome back to Oficio AI"
    />
  );
}
