import { NextResponse } from "next/server";
import { appEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function supabaseUrlMetadata() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    const url = new URL(value);
    const projectRef = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1] ?? null;
    return {
      hasRestPath: url.pathname.includes("/rest/v1"),
      hostname: url.hostname,
      pathname: url.pathname,
      projectRef
    };
  } catch {
    return {
      hasRestPath: false,
      hostname: null,
      pathname: null,
      projectRef: null
    };
  }
}

function decodeJwtPayload(value?: string | null) {
  const token = String(value ?? "");
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8")) as {
      exp?: number;
      ref?: string;
      role?: string;
    };
  } catch {
    return null;
  }
}

function keyMetadata(value?: string | null) {
  const key = String(value ?? "");
  const payload = decodeJwtPayload(key);

  return {
    configured: Boolean(key),
    expiresAt: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
    kind: key.startsWith("sb_secret_") ? "supabase_secret_key" : payload ? "legacy_jwt_key" : key ? "opaque_key" : "missing",
    ref: payload?.ref ?? null,
    role: payload?.role ?? null
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Add ?email=user@example.com." }, { status: 400 });
  }

  const url = supabaseUrlMetadata();
  const diagnostics = {
    environment: {
      appEnvironment: appEnvironment(),
      nodeEnv: process.env.NODE_ENV ?? null,
      oficioSupabaseProjectRef: process.env.OFICIO_SUPABASE_PROJECT_REF ?? null,
      oficioProductionSupabaseProjectRef: process.env.OFICIO_PRODUCTION_SUPABASE_PROJECT_REF ?? null,
      supabaseUrl: url,
      vercelEnv: process.env.VERCEL_ENV ?? null
    },
    keys: {
      anon: keyMetadata(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      service: keyMetadata(process.env.SUPABASE_SERVICE_ROLE_KEY)
    },
    lookup: {
      authUsers: [] as Array<{ email: string | null; emailConfirmed: boolean; id: string }>,
      publicUsers: [] as Array<{ email: string | null; id: string; role: string | null }>
    }
  };

  try {
    const supabase = createAdminClient();
    const [{ data: publicUsers, error: publicUsersError }, authUsersResult] = await Promise.all([
      supabase
        .from("users")
        .select("id,email,role")
        .eq("email", email)
        .limit(5),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);

    if (publicUsersError) {
      return NextResponse.json({
        ...diagnostics,
        lookupError: {
          source: "public.users",
          message: publicUsersError.message
        }
      });
    }

    diagnostics.lookup.publicUsers = (publicUsers ?? []).map((user) => ({
      email: typeof user.email === "string" ? user.email : null,
      id: String(user.id),
      role: typeof user.role === "string" ? user.role : null
    }));

    if (authUsersResult.error) {
      return NextResponse.json({
        ...diagnostics,
        lookupError: {
          source: "auth.users",
          message: authUsersResult.error.message
        }
      });
    }

    diagnostics.lookup.authUsers = authUsersResult.data.users
      .filter((user) => user.email?.toLowerCase() === email)
      .map((user) => ({
        email: user.email ?? null,
        emailConfirmed: Boolean(user.email_confirmed_at),
        id: user.id
      }));

    return NextResponse.json(diagnostics);
  } catch (error) {
    return NextResponse.json({
      ...diagnostics,
      lookupError: {
        source: "server",
        message: error instanceof Error ? error.message : "Unknown diagnostics error."
      }
    });
  }
}
