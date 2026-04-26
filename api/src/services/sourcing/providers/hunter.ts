/**
 * Hunter.io — email finder + verifier.
 *
 * Endpoint: https://api.hunter.io/v2/email-finder
 * Auth: `api_key` query param.
 * Cost: ~$0.05 per find. Free tier 25/mo.
 *
 * Specialty provider: only used when the resolver needs an email but we
 * don't have one yet (i.e. name + company query, no other provider matched).
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingResult } from "../types.js";

const BASE = "https://api.hunter.io/v2/email-finder";

interface HunterResponse {
  data?: {
    email?: string;
    score?: number;
    first_name?: string;
    last_name?: string;
    position?: string;
    company?: string;
    linkedin_url?: string;
    twitter?: string;
    country?: string;
  };
}

export const hunterProvider: SourcingProvider = {
  slug: "hunter",

  isConfigured(ctx) {
    return !!ctx.apiKey;
  },

  supports(kind) {
    return kind === "name_company" || kind === "domain";
  },

  async enrich(ctx, query) {
    if (!ctx.apiKey) {
      throw new ProviderError(this.slug, "NO_CREDENTIALS", "HUNTER_API_KEY not configured");
    }

    const params = new URLSearchParams({ api_key: ctx.apiKey });
    if (query.kind === "name_company") {
      const [first, ...rest] = query.name.trim().split(/\s+/);
      params.set("first_name", first);
      params.set("last_name", rest.join(" "));
      params.set("company", query.company);
    } else if (query.kind === "domain") {
      params.set("domain", query.value);
    } else {
      return { found: false };
    }

    const res = await fetch(`${BASE}?${params.toString()}`);
    if (res.status === 404) return { found: false };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status} ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as HunterResponse;
    const d = json.data;
    if (!d?.email) return { found: false, rawPayload: json };

    return {
      found: true,
      email: d.email,
      givenName: d.first_name,
      familyName: d.last_name,
      fullName: [d.first_name, d.last_name].filter(Boolean).join(" ") || undefined,
      title: d.position,
      company: d.company,
      linkedinUrl: d.linkedin_url,
      twitterHandle: d.twitter,
      countryCode: d.country?.toUpperCase(),
      confidence: d.score ? d.score / 100 : undefined,
      rawPayload: json,
    };
  },
};
