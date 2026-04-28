import { signInOwner } from "@/app/actions/auth";
import { LoginCard } from "@/components/auth/login-card";

export default function OwnerLoginPage() {
  return (
    <LoginCard
      action={signInOwner}
      eyebrow="Owner portal"
      helper="Use the email and password created for your business account in Supabase Auth."
      submitLabel="Open my dashboard"
      subtitle="Answer customers in any language, receive Spanish summaries, and manage bookings from one clean dashboard."
      title="Welcome back to Oficio AI"
    />
  );
}

