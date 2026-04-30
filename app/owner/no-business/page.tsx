import { signOutUser } from "@/app/actions/auth";
import Image from "next/image";

export default function NoBusinessPage() {
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Oficio AI setup needed">
        <div className="auth-visual-copy">
          <h2>
            Simplify management with our <span className="hero-highlight">dashboard</span>.
          </h2>
          <p>Ana answers calls and texts, books jobs, and sends you clear Spanish summaries.</p>
        </div>
        <Image
          alt=""
          aria-hidden="true"
          className="auth-owners-image"
          height={1086}
          priority
          src="/auth/oficio-owners-hero-cutout.png"
          unoptimized
          width={1448}
        />
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">No business found</div>
          <h1>Your login is not connected yet</h1>
          <p className="subcopy">Ask an admin to connect this owner account to a business, then sign in again.</p>
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
