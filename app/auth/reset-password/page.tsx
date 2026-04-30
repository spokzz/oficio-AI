import { ResetPasswordCard } from "@/components/auth/reset-password-card";

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    error?: string;
    portal?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const portal = params?.portal === "admin" ? "admin" : "owner";

  return <ResetPasswordCard error={params?.error} portal={portal} />;
}
