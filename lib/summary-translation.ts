export type OwnerSummaryLanguage = "en" | "es";

export function ownerSummaryLanguage(language?: string | null): OwnerSummaryLanguage {
  return String(language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}
