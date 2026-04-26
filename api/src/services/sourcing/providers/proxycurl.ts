/**
 * Proxycurl (Nubela) — LinkedIn URL → profile.
 *
 * Endpoint: https://nubela.co/proxycurl/api/v2/linkedin
 * Auth: bearer token in `Authorization` header.
 * Cost: ~$0.01–$0.04 per URL. Cheapest fallback for LinkedIn-derived data.
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingResult } from "../types.js";

const BASE = "https://nubela.co/proxycurl/api/v2/linkedin";

interface ProxycurlResponse {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  occupation?: string;
  headline?: string;
  city?: string;
  state?: string;
  country_full_name?: string;
  country?: string;
  experiences?: Array<{ company?: string; title?: string }>;
}

export const proxycurlProvider: SourcingProvider = {
  slug: "proxycurl",

  isConfigured(ctx) {
    return !!ctx.apiKey;
  },

  supports(kind) {
    return kind === "linkedin_url";
  },

  async enrich(ctx, query) {
    if (!ctx.apiKey) {
      throw new ProviderError(this.slug, "NO_CREDENTIALS", "PROXYCURL_API_KEY not configured");
    }
    if (query.kind !== "linkedin_url") return { found: false };

    const params = new URLSearchParams({ url: query.value, fallback_to_cache: "on-error" });
    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
    });

    if (res.status === 404) return { found: false };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status} ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as ProxycurlResponse;
    const currentExp = json.experiences?.[0];
    const location = [json.city, json.state, json.country_full_name].filter(Boolean).join(", ") || undefined;

    return {
      found: !!json.full_name,
      fullName: json.full_name,
      givenName: json.first_name,
      familyName: json.last_name,
      linkedinUrl: query.value,
      title: currentExp?.title ?? json.occupation,
      company: currentExp?.company,
      location,
      countryCode: json.country?.toUpperCase(),
      rawPayload: json,
    };
  },
};
