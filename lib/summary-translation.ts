import { assertNoProtectedSecrets, assertProviderEnvironmentSafety } from "@/lib/environment";

export type OwnerSummaryLanguage = "en" | "es";

type TranslateOwnerTextParams = {
  kind?: string;
  language: OwnerSummaryLanguage;
  text: string | null | undefined;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TRANSLATION_MODEL = "gpt-5.4-nano";

export function ownerSummaryLanguage(language?: string | null): OwnerSummaryLanguage {
  return String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

export function compactOwnerText(value: string | null | undefined, maxLength = 700) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function textFromResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const directText = (payload as { output_text?: unknown }).output_text;
  if (typeof directText === "string" && directText.trim()) return directText.trim();

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  const parts: string[] = [];
  for (const item of output) {
    const content = (item as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      const text = (block as { text?: unknown })?.text;
      if (typeof text === "string" && text.trim()) parts.push(text.trim());
    }
  }

  return parts.join(" ").trim() || null;
}

export function ownerTranslationConfigured() {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.OFICIO_OWNER_TRANSLATION_ENABLED !== "false";
}

export async function tryTranslateOwnerText({ kind = "summary", language, text }: TranslateOwnerTextParams) {
  const compactText = compactOwnerText(text);
  if (!compactText) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!ownerTranslationConfigured() || !apiKey) return null;
  assertProviderEnvironmentSafety({
    allowProductionInLocalEnvName: "OFICIO_ALLOW_PRODUCTION_OPENAI_LOCAL",
    provider: "OpenAI",
    providerEnvironment: process.env.OPENAI_KEY_ENV,
    service: "owner-summary-translation"
  });

  const target = language === "es" ? "Spanish" : "English";
  const model = process.env.OPENAI_TRANSLATION_MODEL || DEFAULT_TRANSLATION_MODEL;
  const developerInstructions =
    `Rewrite this owner-facing ${kind} in clear ${target}. Use a professional business summary style: short outcome sentence, customer details, request details, missing information, and recommended owner action. ` +
    "Preserve names, phone numbers, addresses, dates, times, prices, and service details exactly. " +
    "Do not add facts. Do not include internal/debug phrases like tool call failed, realtime created, saved lead because, or owner approval SMS was not sent. " +
    "Convert internal states into owner-friendly wording such as Needs owner approval, New lead created, Name not collected, Address missing, or Call ended before Ana collected all details. Return only the rewritten text.";
  assertNoProtectedSecrets(developerInstructions, "owner summary translation instructions");

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                type: "input_text",
                text: developerInstructions
              }
            ],
            role: "developer"
          },
          {
            content: [{ type: "input_text", text: compactText }],
            role: "user"
          }
        ],
        max_output_tokens: 260,
        model,
        store: false,
        text: { verbosity: "low" }
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      console.error("Owner summary translation failed:", response.status, payload);
      return null;
    }

    return compactOwnerText(textFromResponse(await response.json()));
  } catch (error) {
    console.error("Owner summary translation failed:", error);
    return null;
  }
}

export async function translateOwnerText(params: TranslateOwnerTextParams) {
  return (await tryTranslateOwnerText(params)) || compactOwnerText(params.text);
}
