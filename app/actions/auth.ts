"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type LoginState = {
  error?: string;
};

export async function signInOwner(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
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

  redirect(`/owner?lang=${language}`);
}

export async function signInAdmin(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
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

export async function signOutUser() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
