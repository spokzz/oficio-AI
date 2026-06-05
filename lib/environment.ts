const APP_ENVIRONMENTS = ["local", "staging", "production"] as const;
const SECRET_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "GEOCODIO_API_KEY",
  "CRON_SECRET",
  "OFICIO_CRON_SECRET",
  "INTERNAL_WEBHOOK_SECRET"
];

type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

function normalizeEnvironment(value?: string | null): AppEnvironment | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "prod") return "production";
  if (normalized === "preview") return "staging";
  return APP_ENVIRONMENTS.includes(normalized as AppEnvironment) ? (normalized as AppEnvironment) : null;
}

export function appEnvironment(): AppEnvironment {
  return normalizeEnvironment(process.env.OFICIO_ENV) ?? normalizeEnvironment(process.env.VERCEL_ENV) ?? (process.env.NODE_ENV === "production" ? "production" : "local");
}

function truthy(value?: string | null) {
  return /^(1|true|yes)$/i.test(String(value ?? "").trim());
}

function supabaseProjectRef(url?: string | null) {
  const hostname = (() => {
    try {
      return new URL(String(url ?? "")).hostname;
    } catch {
      return "";
    }
  })();
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1] ?? null;
}

export function assertSupabaseEnvironmentSafety({
  service = "server"
}: {
  service?: string;
} = {}) {
  const env = appEnvironment();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configuredRef = supabaseProjectRef(supabaseUrl);
  const expectedRef = process.env.OFICIO_SUPABASE_PROJECT_REF?.trim();
  const productionRef = process.env.OFICIO_PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  if (expectedRef && configuredRef && configuredRef !== expectedRef) {
    throw new Error(`${service}: NEXT_PUBLIC_SUPABASE_URL points to ${configuredRef}, but OFICIO_SUPABASE_PROJECT_REF is ${expectedRef}.`);
  }

  if (env !== "production" && productionRef && configuredRef === productionRef && !truthy(process.env.OFICIO_ALLOW_PRODUCTION_SUPABASE_IN_NONPROD)) {
    throw new Error(`${service}: ${env} is configured to use the production Supabase project. Set a ${env} Supabase URL or explicitly set OFICIO_ALLOW_PRODUCTION_SUPABASE_IN_NONPROD=true.`);
  }
}

export function assertProviderEnvironmentSafety({
  provider,
  providerEnvironment,
  allowProductionInLocalEnvName,
  service = "server"
}: {
  allowProductionInLocalEnvName: string;
  provider: string;
  providerEnvironment?: string | null;
  service?: string;
}) {
  const env = appEnvironment();
  const secretEnv = normalizeEnvironment(providerEnvironment);

  if (env === "local" && secretEnv === "production" && !truthy(process.env[allowProductionInLocalEnvName])) {
    throw new Error(`${service}: local is configured to use production ${provider} secrets. Use local/staging ${provider} credentials or set ${allowProductionInLocalEnvName}=true for an intentional exception.`);
  }

  if (env === "staging" && secretEnv === "production" && !truthy(process.env.OFICIO_ALLOW_PRODUCTION_PROVIDER_SECRETS_IN_STAGING)) {
    throw new Error(`${service}: staging is configured to use production ${provider} secrets. Use staging ${provider} credentials or set OFICIO_ALLOW_PRODUCTION_PROVIDER_SECRETS_IN_STAGING=true for an intentional exception.`);
  }
}

function protectedSecretValues() {
  return SECRET_ENV_NAMES.map((name) => ({ name, value: process.env[name]?.trim() }))
    .filter((secret): secret is { name: string; value: string } => Boolean(secret.value && secret.value.length >= 12 && !secret.value.startsWith("your-") && !secret.value.startsWith("replace-with-")));
}

export function assertNoProtectedSecrets(value: string, label: string) {
  for (const secret of protectedSecretValues()) {
    if (value.includes(secret.value)) {
      throw new Error(`${label} includes ${secret.name}. Secrets must not be sent to Ana prompts or rendered dashboard config.`);
    }
  }
}

export { SECRET_ENV_NAMES };
