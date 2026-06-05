import { createClient } from "@supabase/supabase-js";
import { assertSupabaseEnvironmentSafety } from "@/lib/environment";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for admin system tasks.");
  }

  if (!serviceRoleKey || serviceRoleKey.startsWith("your-")) {
    throw new Error("Replace SUPABASE_SERVICE_ROLE_KEY in .env.local with your real Supabase service role key, then restart npm run dev.");
  }

  assertSupabaseEnvironmentSafety({ service: "supabase-admin" });

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
