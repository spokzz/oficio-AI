"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type LoginState = {
  error?: string;
};

type PasswordResetState = {
  error?: string;
  success?: string;
};

export async function signInOwner(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const language = formData.get("language") === "es" ? "es" : "en";

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email or password is incorrect." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("users").select("role").eq("id", user?.id).maybeSingle();

  if (profile?.role === "platform_admin") {
    await supabase.auth.signOut();
    return { error: "This is an admin account. Use the admin login instead." };
  }

  if (profile?.role !== "owner") {
    await supabase.auth.signOut();
    return { error: "This email is not set up as an owner account." };
  }

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id")
    .eq("user_id", user?.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    await supabase.auth.signOut();
    return { error: "This owner account is not connected to a business yet." };
  }

  redirect(`/owner?lang=${language}`);
}

export async function signInAdmin(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email or password is incorrect." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("users").select("role").eq("id", user?.id).maybeSingle();

  if (profile?.role !== "platform_admin") {
    await supabase.auth.signOut();
    return { error: "This login is not authorized for the admin portal." };
  }

  redirect("/admin");
}

export async function requestPasswordReset(_state: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const portal = formData.get("portal") === "admin" ? "admin" : "owner";

  if (!email) {
    return { error: "Please enter your email address." };
  }

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch {
    return { error: "Password reset is not configured. Contact an admin." };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("users")
    .select("id,role")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    return { error: "We could not check this account. Please try again." };
  }

  if (!profile) {
    return { error: "We could not find an account for this email. Talk to an admin." };
  }

  if (portal === "admin" && profile.role !== "platform_admin") {
    return { error: "We could not find an admin account for this email. Talk to an admin." };
  }

  if (portal === "owner" && profile.role !== "owner") {
    return { error: "We could not find an owner account for this email. Talk to an admin." };
  }

  if (portal === "owner") {
    const { data: membership, error: membershipError } = await adminSupabase
      .from("business_users")
      .select("business_id")
      .eq("user_id", profile.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return { error: "We could not check this owner account. Please try again." };
    }

    if (!membership) {
      return { error: "This owner account is not connected to a business yet. Talk to an admin." };
    }
  }

  const { data: authUserResult, error: authUserError } = await adminSupabase.auth.admin.getUserById(profile.id);

  if (authUserError || !authUserResult.user?.email) {
    return { error: "This account exists in the app database, but no matching Supabase Auth user was found. Talk to an admin." };
  }

  return { success: authUserResult.user.email };
}

export async function updatePassword(_state: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const portal = formData.get("portal") === "admin" ? "admin" : "owner";

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "This reset link has expired. Request a new password reset email." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "We could not update your password. Request a new reset link and try again." };
  }

  await supabase.auth.signOut();
  redirect(`/${portal}/login?reset=success`);
}

export async function signOutUser() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
