"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

type ResetPasswordCardProps = {
  error?: string;
  portal: "admin" | "owner";
};

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

export function ResetPasswordCard({ error, portal }: ResetPasswordCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(error ? "This password reset link is invalid or expired. Request a new link." : null);
  const [isPreparingSession, setIsPreparingSession] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const loginHref = portal === "admin" ? "/admin/login" : "/owner/login";

  useEffect(() => {
    let isMounted = true;

    async function prepareRecoverySession() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type") as EmailOtpType | null;
      const hashError = hashParams.get("error_description") ?? hashParams.get("error");
      let sessionError: Error | null = null;

      if (hashError) {
        sessionError = new Error(hashError);
      } else if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        sessionError = setSessionError;
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        sessionError = exchangeError;
      } else if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type
        });
        sessionError = verifyError;
      } else {
        const {
          data: { session },
          error: existingSessionError
        } = await supabase.auth.getSession();
        sessionError = session ? null : existingSessionError ?? new Error("No recovery session found.");
      }

      if (!isMounted) return;

      if (sessionError) {
        setRecoveryError("This password reset link is invalid or expired. Request a new link.");
      } else {
        window.localStorage.removeItem("oficio-password-reset-portal");
        url.hash = "";
        url.searchParams.delete("code");
        url.searchParams.delete("token_hash");
        url.searchParams.delete("type");
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
        setRecoveryError(null);
      }

      setIsPreparingSession(false);
    }

    prepareRecoverySession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setIsUpdating(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setFormError("We could not update your password. Request a new reset link and try again.");
      setIsUpdating(false);
      return;
    }

    window.localStorage.removeItem("oficio-password-reset-portal");
    await supabase.auth.signOut();
    window.location.assign(`${loginHref}?reset=success`);
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Oficio AI password reset">
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
          <div className="auth-logo-row">
            <Image alt="Oficio AI" height={54} priority src="/brand/oficio-ai-logo.svg" width={240} />
          </div>
          <h1>Reset password</h1>
          <p className="subcopy">Choose a new password for your Oficio AI account.</p>
          <form className="auth-form" onSubmit={handlePasswordUpdate}>
            <div className="password-field">
              <input
                autoComplete="new-password"
                name="password"
                placeholder="New password"
                required
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                <PasswordEyeIcon />
              </button>
            </div>
            <input autoComplete="new-password" name="confirmPassword" placeholder="Confirm password" required type="password" />
            {isPreparingSession ? <p className="form-success">Preparing your password reset...</p> : null}
            {recoveryError ? <p className="form-error">{recoveryError}</p> : null}
            {formError ? <p className="form-error">{formError}</p> : null}
            <button className="auth-submit" disabled={Boolean(recoveryError) || isPreparingSession || isUpdating} type="submit">
              {isUpdating ? "Updating..." : "Update password"}
            </button>
          </form>
          <p className="auth-helper">
            <Link href={loginHref}>Back to login</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
