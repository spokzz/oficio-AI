import { signOutUser } from "@/app/actions/auth";
import Image from "next/image";

export default function NoBusinessPage() {
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand">
          <Image src="/brand/oficio-ai-logo.svg" alt="Oficio AI" width={1200} height={360} priority />
        </div>
        <div className="auth-phone">
          <div className="phone-top">Setup needed</div>
          <div className="bubble owner">Este usuario todavía no está conectado a un negocio.</div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">No business found</div>
          <h1>Your login is not connected yet</h1>
          <p className="subcopy">
            Create a business in Supabase and add a `business_users` record for this auth user.
          </p>
          <form action={signOutUser}>
            <button className="button primary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
