"use client";

import Image from "next/image";
import { LockKeyhole, Mail } from "lucide-react";
import { useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";

type LoginCardProps = {
  action: (state: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  resetAction: (
    state: { error?: string; success?: string },
    formData: FormData
  ) => Promise<{ error?: string; success?: string }>;
  variant?: "owner" | "admin";
  notice?: string;
  children?: ReactNode;
};

type LoginLanguage = "en" | "es";

const loginCopy = {
  owner: {
    en: {
      heroTitle: "Never miss a job by language.",
      heroBody: "Ana answers calls, books jobs, and sends every job summary in Spanish or English.",
      welcome: "Welcome Back",
      subtitle: "Please login to your account",
      email: "Email address",
      password: "Password",
      forgot: "Forgot password?",
      submit: "Log in",
      pending: "Signing in...",
      resetTitle: "Reset password",
      resetSubtitle: "Enter your owner email and we'll send a reset link.",
      resetSubmit: "Send reset link",
      resetPending: "Sending...",
      backToLogin: "Back to login",
      helper: "Use the email and password created for your business account."
    },
    es: {
      heroTitle: "Nunca pierdas un trabajo por el idioma.",
      heroBody: "Ana contesta llamadas, agenda trabajos y envía el resumen de cada trabajo en español o inglés.",
      welcome: "Bienvenido",
      subtitle: "Inicia sesión en tu cuenta",
      email: "Correo electrónico",
      password: "Contraseña",
      forgot: "¿Olvidaste tu contraseña?",
      submit: "Log in",
      pending: "Entrando...",
      resetTitle: "Restablecer contraseña",
      resetSubtitle: "Escribe tu correo de dueño y enviaremos un enlace.",
      resetSubmit: "Enviar enlace",
      resetPending: "Enviando...",
      backToLogin: "Volver al login",
      helper: "Usa el correo y contraseña creados para tu negocio."
    }
  },
  admin: {
    en: {
      heroTitle: "Run your business from one dashboard.",
      heroBody: "Ana answers calls, books jobs, and sends every job summary in Spanish or English.",
      welcome: "Welcome Back",
      subtitle: "Please login to your admin account",
      email: "Email address",
      password: "Password",
      forgot: "Forgot password?",
      submit: "Log in",
      pending: "Signing in...",
      resetTitle: "Reset password",
      resetSubtitle: "Enter your admin email and we'll send a reset link.",
      resetSubmit: "Send reset link",
      resetPending: "Sending...",
      backToLogin: "Back to login",
      helper: "Admin access requires your user role to be platform_admin."
    }
  }
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="auth-submit" disabled={pending} type="submit">
      {pending ? pendingLabel : label}
    </button>
  );
}

function PasswordEyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.5 5.4A9.7 9.7 0 0 1 12 5c5.4 0 8.8 4.7 9.8 7-0.4 1-1.4 2.4-2.9 3.7" />
      <path d="M6.2 6.8C4.2 8.2 2.9 10.3 2.2 12c1 2.3 4.4 7 9.8 7 1.5 0 2.8-.4 4-1" />
    </svg>
  );
}

function HeroTitle({ language, variant }: { language: LoginLanguage; variant: "owner" | "admin" }) {
  if (language === "en") {
    return (
      <>
        Run your business from one <span className="hero-highlight">dashboard</span>.
      </>
    );
  }

  if (variant === "owner") {
    return (
      <>
        Maneja tu negocio desde un solo <span className="hero-highlight">panel</span>.
      </>
    );
  }

  return <>{loginCopy.admin.en.heroTitle}</>;
}

export function LoginCard({
  action,
  resetAction,
  variant = "owner",
  notice,
  children
}: LoginCardProps) {
  const [language, setLanguage] = useState<LoginLanguage>("en");
  const [showMobileForm, setShowMobileForm] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useActionState(action, {});
  const [resetMessage, setResetMessage] = useState<{ error?: string; success?: string }>({});
  const [isSendingReset, setIsSendingReset] = useState(false);
  const copy = variant === "admin" ? loginCopy.admin.en : loginCopy.owner[language];

  useEffect(() => {
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      document.head.appendChild(themeMeta);
    }

    themeMeta.content = showMobileForm || isResetMode ? "#ffffff" : "#fe741d";

    return () => {
      themeMeta.content = "#faf7f1";
    };
  }, [isResetMode, showMobileForm]);

  function passwordResetSendError(message: string) {
    const normalizedMessage = message.toLowerCase();
    const resetUrl = `${window.location.origin}/auth/reset-password`;

    if (normalizedMessage.includes("redirect") || normalizedMessage.includes("not allowed")) {
      return `Supabase blocked the reset link redirect. Add this URL to Authentication > URL Configuration > Redirect URLs: ${resetUrl}`;
    }

    if (normalizedMessage.includes("email address not authorized")) {
      return "Supabase blocked the email because the default email service only sends to authorized team addresses. Add this email to the Supabase project team for testing, or configure custom SMTP.";
    }

    if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
      return "Supabase email rate limit was reached. Wait a few minutes or configure custom SMTP for password reset emails.";
    }

    return `Supabase could not send the password reset email: ${message}`;
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSendingReset(true);
    setResetMessage({});

    const formData = new FormData(event.currentTarget);
    const checkedAccount = await resetAction({}, formData);

    if (checkedAccount.error) {
      setResetMessage({ error: checkedAccount.error });
      setIsSendingReset(false);
      return;
    }

    const email = checkedAccount.success;

    if (!email) {
      setResetMessage({ error: "We could not verify this account. Talk to an admin." });
      setIsSendingReset(false);
      return;
    }

    window.localStorage.setItem("oficio-password-reset-portal", variant);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password?portal=${variant}`
    });

    if (error) {
      setResetMessage({ error: passwordResetSendError(error.message) });
      setIsSendingReset(false);
      return;
    }

    setResetMessage({ success: "Password reset email sent. Check your inbox." });
    setIsSendingReset(false);
  }

  const languageToggle =
    variant === "owner" ? (
      <div className="login-language-toggle" role="group" aria-label="Login language">
        <button className={language === "es" ? "active" : ""} onClick={() => setLanguage("es")} type="button">
          Español
        </button>
        <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} type="button">
          English
        </button>
      </div>
    ) : null;

  return (
    <main className={`auth-page${showMobileForm ? " mobile-form-open" : ""}`}>
      {languageToggle}
      <section className="auth-visual" aria-label="Oficio AI">
        <div className="auth-visual-copy">
          <h2>
            <HeroTitle language={language} variant={variant} />
          </h2>
          <p>{copy.heroBody}</p>
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
        <button className="mobile-visual-login" onClick={() => setShowMobileForm(true)} type="button">
          {copy.submit}
        </button>
        <button className="mobile-create-account" type="button">
          Create an account
        </button>
      </section>

      <section className="auth-panel" id="login-panel">
        <div className="auth-card">
          <div className="auth-logo-row">
            <Image alt="Oficio AI - Never miss a job." height={140} priority src="/brand/oficio-logo.svg" width={420} />
          </div>
          <h1>{isResetMode ? copy.resetTitle : copy.welcome}</h1>
          <p className="subcopy">{isResetMode ? copy.resetSubtitle : copy.subtitle}</p>
          {notice && !isResetMode ? <p className="form-success">{notice}</p> : null}
          {isResetMode ? (
            <form className="auth-form" onSubmit={handleResetSubmit}>
              <input name="portal" type="hidden" value={variant} />
              <label className="auth-input-field">
                <Mail aria-hidden="true" />
                <input name="email" type="email" autoComplete="email" placeholder={copy.email} required />
              </label>
              {resetMessage.error ? <p className="form-error">{resetMessage.error}</p> : null}
              {resetMessage.success ? <p className="form-success">{resetMessage.success}</p> : null}
              <button className="auth-submit" disabled={isSendingReset} type="submit">
                {isSendingReset ? copy.resetPending : copy.resetSubmit}
              </button>
              <button className="forgot-link auth-text-button" onClick={() => setIsResetMode(false)} type="button">
                {copy.backToLogin}
              </button>
            </form>
          ) : (
            <form action={formAction} className="auth-form">
              {variant === "owner" ? <input name="language" type="hidden" value={language} /> : null}
              <label className="auth-input-field">
                <Mail aria-hidden="true" />
                <input name="email" type="email" autoComplete="email" placeholder={copy.email} required />
              </label>
              <div className="password-field">
                <LockKeyhole className="auth-field-icon" aria-hidden="true" />
                <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={copy.password} required />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  <PasswordEyeIcon />
                </button>
              </div>
              <button className="forgot-link auth-text-button" onClick={() => setIsResetMode(true)} type="button">
                {copy.forgot}
              </button>
              {state.error ? <p className="form-error">{state.error}</p> : null}
              <SubmitButton label={copy.submit} pendingLabel={copy.pending} />
            </form>
          )}
          {!isResetMode ? (
            <>
              <button className="auth-create-account" type="button">
                Create an account
              </button>
              <p className="auth-legal">
                By logging in, you agree to our <a href="#">Terms of Use</a> and <a href="#">Privacy Policy</a>.
              </p>
            </>
          ) : null}
          <p className="auth-footnote">{copy.helper}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
