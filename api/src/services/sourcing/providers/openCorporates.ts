/**
 * OpenCorporates — public officer/director records across global jurisdictions.
 *
 * Endpoint: https://api.opencorporates.com/v0.4/officers/search
 * Auth: optional `api_token` query param (free tier 200/mo without).
 * Cost: free tier; paid for higher volume.
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingResult } from "../types.js";

interface OCOfficer {
  officer?: {
    name?: string;
    position?: string;
    nationality?: string;
    company?: { name?: string; jurisdiction_code?: string };
  };
}

export const openCorporatesProvider: SourcingProvider = {
  slug: "opencorporates",

  isConfigured(_ctx) {
    return true; // Free tier works without API key.
  },

  supports(kind) {
    return kind === "name_company";
  },

  async enrich(ctx, query) {
    if (query.kind !== "name_company") return { found: false };

    const params = new URLSearchParams({ q: query.name });
    if (ctx.apiKey) params.set("api_token", ctx.apiKey);

    const res = await fetch(`https://api.opencorporates.com/v0.4/officers/search?${params.toString()}`);
    if (!res.ok) {
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status}`);
    }

    const json = (await res.json()) as { results?: { officers?: OCOfficer[] } };
    const officers = json.results?.officers ?? [];
    const wanted = query.company.toLowerCase();
    const match = officers.find((o) => o.officer?.company?.name?.toLowerCase().includes(wanted));
    if (!match?.officer) return { found: false, rawPayload: json };

    return {
      found: true,
      fullName: match.officer.name,
      title: match.officer.position,
      company: match.officer.company?.name,
      countryCode: match.officer.company?.jurisdiction_code?.split("_")[0]?.toUpperCase(),
      rawPayload: match,
    };
  },
};
