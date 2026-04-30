import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for admin system tasks.");
  }

  if (!serviceRoleKey || serviceRoleKey.startsWith("your-")) {
    throw new Error("Replace SUPABASE_SERVICE_ROLE_KEY in .env.local with your real Supabase service role key, then restart npm run dev.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
