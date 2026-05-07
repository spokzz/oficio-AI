import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GeoapifyResult = {
  address_line1?: string;
  address_line2?: string;
  city?: string;
  country_code?: string;
  formatted?: string;
  lat?: number;
  lon?: number;
  postcode?: string;
  state?: string;
  state_code?: string;
};

function cleanSuggestion(result: GeoapifyResult) {
  const label = String(result.formatted || [result.address_line1, result.address_line2].filter(Boolean).join(", ")).trim();
  if (!label) return null;

  return {
    city: result.city ?? null,
    countryCode: result.country_code ?? null,
    label,
    lat: typeof result.lat === "number" ? result.lat : null,
    lng: typeof result.lon === "number" ? result.lon : null,
    postcode: result.postcode ?? null,
    state: result.state_code ?? result.state ?? null
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEOAPIFY_API_KEY is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const query = String(url.searchParams.get("query") ?? "").replace(/\s+/g, " ").trim();
  if (query.length < 4) {
    return NextResponse.json({ suggestions: [] });
  }

  const upstreamUrl = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  upstreamUrl.searchParams.set("text", query);
  upstreamUrl.searchParams.set("format", "json");
  upstreamUrl.searchParams.set("limit", "5");
  upstreamUrl.searchParams.set("lang", "en");
  upstreamUrl.searchParams.set("filter", "countrycode:us");
  upstreamUrl.searchParams.set("apiKey", apiKey);

  const response = await fetch(upstreamUrl, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: `Address lookup returned ${response.status}.` }, { status: 502 });
  }

  const payload = (await response.json()) as { results?: GeoapifyResult[] };
  const suggestions = (payload.results ?? []).map(cleanSuggestion).filter(Boolean);

  return NextResponse.json({ suggestions });
}
