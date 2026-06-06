import { assertProviderEnvironmentSafety } from "@/lib/environment";

export type GeocodedAddress = {
  accuracy: number | null;
  formattedAddress: string;
  lat: number;
  lng: number;
  provider: "geocodio";
};

export type GeocodeResult =
  | {
      address: GeocodedAddress;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      skipped?: string;
    };

const GEOCODIO_ENDPOINT = "https://api.geocod.io/v1.9/geocode";

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function geocodioApiKey() {
  return process.env.GEOCODIO_API_KEY?.trim().replace(/;+$/, "");
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const query = address.trim();
  if (!query) {
    return { error: "Enter an address to geocode.", ok: false };
  }

  const apiKey = geocodioApiKey();
  if (!apiKey) {
    return { error: "GEOCODIO_API_KEY is not configured.", ok: false, skipped: "missing_api_key" };
  }
  assertProviderEnvironmentSafety({
    allowProductionInLocalEnvName: "OFICIO_ALLOW_PRODUCTION_GEOCODIO_LOCAL",
    provider: "Geocodio",
    providerEnvironment: process.env.GEOCODIO_KEY_ENV,
    service: "geocoding"
  });

  const url = new URL(GEOCODIO_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("country", "USA");
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return { error: `Geocodio returned ${response.status}.`, ok: false };
  }

  const payload = (await response.json()) as {
    results?: Array<{
      accuracy?: number;
      formatted_address?: string;
      location?: {
        lat?: number | string;
        lng?: number | string;
      };
    }>;
  };
  const first = payload.results?.[0];
  const lat = numberOrNull(first?.location?.lat);
  const lng = numberOrNull(first?.location?.lng);

  if (!first || lat === null || lng === null) {
    return { error: "Geocodio could not find coordinates for that address.", ok: false };
  }

  const accuracy = numberOrNull(first.accuracy);
  if (accuracy !== null && accuracy < 0.6) {
    return { error: "That address match is too uncertain. Please enter a more complete address.", ok: false };
  }

  return {
    address: {
      accuracy,
      formattedAddress: first.formatted_address || query,
      lat,
      lng,
      provider: "geocodio"
    },
    ok: true
  };
}
