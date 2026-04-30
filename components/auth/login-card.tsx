"use client";

import Image from "next/image";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type LoginCardProps = {
  title: string;
  eyebrow: string;
  subtitle: string;
  helper: string;
  action: (state: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  submitLabel: string;
  variant?: "owner" | "admin";
  children?: ReactNode;
};

type LoginLanguage = "en" | "es";

const loginCopy = {
  owner: {
    en: {
      heroTitle: "Never miss a job by language.",
      heroBody: "Ana answers calls and texts, books jobs, and sends you clear Spanish summaries.",
      welcome: "Welcome Back",
      subtitle: "Please login to your account",
      email: "Email address",
      password: "Password",
      forgot: "Forgot password?",
      submit: "Login",
      pending: "Signing in...",
      divider: "Or login with",
      google: "Google",
      facebook: "Facebook",
      signupText: "Don't have an account?",
      signup: "Signup",
      helper: "Use the email and password created for your business account."
    },
    es: {
      heroTitle: "Nunca pierdas un trabajo por el idioma.",
      heroBody: "Ana contesta llamadas y textos, agenda trabajos y te manda resúmenes claros en español.",
      welcome: "Bienvenido",
      subtitle: "Inicia sesión en tu cuenta",
      email: "Correo electrónico",
      password: "Contraseña",
      forgot: "¿Olvidaste tu contraseña?",
      submit: "Entrar",
      pending: "Entrando...",
      divider: "O entra con",
      google: "Google",
      facebook: "Facebook",
      signupText: "¿No tienes cuenta?",
      signup: "Regístrate",
      helper: "Usa el correo y contraseña creados para tu negocio."
    }
  },
  admin: {
    en: {
      heroTitle: "Onboard owners with confidence.",
      heroBody: "Configure businesses, monitor usage, and keep Oficio AI accounts ready for launch.",
      welcome: "Welcome Back",
      subtitle: "Please login to your admin account",
      email: "Email address",
      password: "Password",
      forgot: "Forgot password?",
      submit: "Login",
      pending: "Signing in...",
      divider: "Or login with",
      google: "Google",
      facebook: "Facebook",
      signupText: "Need admin access?",
      signup: "Contact owner",
      helper: "Admin access requires your user role to be platform_admin."
    },
    es: {
      heroTitle: "Configura negocios con confianza.",
      heroBody: "Crea cuentas, revisa uso y deja cada negocio listo para recibir llamadas.",
      welcome: "Bienvenido",
      subtitle: "Inicia sesión en tu cuenta admin",
      email: "Correo electrónico",
      password: "Contraseña",
      forgot: "¿Olvidaste tu contraseña?",
      submit: "Entrar",
      pending: "Entrando...",
      divider: "O entra con",
      google: "Google",
      facebook: "Facebook",
      signupText: "¿Necesitas acceso admin?",
      signup: "Contacta al dueño",
      helper: "El acceso admin requiere que tu usuario sea platform_admin."
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
  if (variant === "owner" && language === "en") {
    return (
      <>
        Simplify management with our <span className="hero-highlight">dashboard</span>.
      </>
    );
  }

  if (variant === "owner") {
    return (
      <>
        Simplifica la gestión con nuestro <span className="hero-highlight">panel</span>.
      </>
    );
  }

  return <>{loginCopy[variant][language].heroTitle}</>;
}

export function LoginCard({ title, eyebrow, subtitle, helper, action, submitLabel, variant = "owner", children }: LoginCardProps) {
  const [language, setLanguage] = useState<LoginLanguage>("en");
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useActionState(action, {});
  const copy = loginCopy[variant][language];

  return (
    <main className="auth-page">
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
      </section>

      <section className="auth-panel">
        <div className="login-language-toggle" role="group" aria-label="Login language">
          <button className={language === "es" ? "active" : ""} onClick={() => setLanguage("es")} type="button">
            Español
          </button>
          <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} type="button">
            English
          </button>
        </div>
        <div className="auth-card">
          <div className="auth-logo-row">
            <Image alt="Oficio AI" height={54} priority src="/brand/oficio-ai-logo.svg" width={240} />
          </div>
          <h1>{copy.welcome}</h1>
          <p className="subcopy">{copy.subtitle}</p>
          <form action={formAction} className="auth-form">
            <input name="language" type="hidden" value={language} />
            <label>
              <input name="email" type="email" autoComplete="email" placeholder={copy.email} required />
            </label>
            <div className="password-field">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={copy.password} required />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                <PasswordEyeIcon />
              </button>
            </div>
            <a className="forgot-link" href="#">
              {copy.forgot}
            </a>
            {state.error ? <p className="form-error">{state.error}</p> : null}
            <SubmitButton label={copy.submit} pendingLabel={copy.pending} />
          </form>
          <div className="auth-divider">
            <span />
            <strong>{copy.divider}</strong>
            <span />
          </div>
          <div className="social-login-row">
            <button type="button">
              <span className="social-dot google-dot">G</span>
              {copy.google}
            </button>
            <button type="button">
              <span className="social-dot facebook-dot">f</span>
              {copy.facebook}
            </button>
          </div>
          <p className="auth-helper">
            {copy.signupText} <a href="#">{copy.signup}</a>
          </p>
          <p className="auth-footnote">{copy.helper}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
