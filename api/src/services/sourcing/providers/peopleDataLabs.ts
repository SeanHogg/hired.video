/**
 * People Data Labs (PDL) — primary enrichment provider.
 *
 * Endpoint: https://api.peopledatalabs.com/v5/person/enrich
 * Auth: header `X-Api-Key`.
 * Cost: ~$0.10–$0.30 per matched record. Free tier 100 calls/mo.
 *
 * The resolver only invokes this provider when cache lookup misses AND
 * cheaper providers (free / Proxycurl) cannot satisfy the query kind.
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingQuery, type SourcingResult } from "../types.js";

const BASE = "https://api.peopledatalabs.com/v5/person/enrich";

interface PDLResponse {
  status: number;
  likelihood?: number;
  data?: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    work_email?: string;
    personal_emails?: string[];
    linkedin_url?: string;
    github_url?: string;
    twitter_username?: string;
    job_title?: string;
    job_company_name?: string;
    location_name?: string;
    location_country?: string;
  };
}

export const peopleDataLabsProvider: SourcingProvider = {
  slug: "peopledatalabs",

  isConfigured(ctx) {
    return !!ctx.apiKey;
  },

  supports(kind) {
    return kind === "email" || kind === "linkedin_url" || kind === "name_company";
  },

  async enrich(ctx, query) {
    if (!ctx.apiKey) {
      throw new ProviderError(this.slug, "NO_CREDENTIALS", "PDL_API_KEY not configured");
    }

    const params = new URLSearchParams({ pretty: "false" });
    if (query.kind === "email") params.set("email", query.value);
    else if (query.kind === "linkedin_url") params.set("profile", query.value);
    else if (query.kind === "name_company") {
      params.set("name", query.name);
      params.set("company", query.company);
    } else {
      return { found: false };
    }

    const res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { "X-Api-Key": ctx.apiKey },
    });

    if (res.status === 404) return { found: false, rawPayload: { status: 404 } };
    if (res.status === 402) {
      throw new ProviderError(this.slug, "QUOTA_EXHAUSTED", "PDL credits exhausted");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status} ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as PDLResponse;
    if (json.status !== 200 || !json.data) return { found: false, rawPayload: json };

    const d = json.data;
    return {
      found: true,
      fullName: d.full_name,
      givenName: d.first_name,
      familyName: d.last_name,
      email: d.work_email ?? d.personal_emails?.[0],
      linkedinUrl: d.linkedin_url ? `https://${d.linkedin_url.replace(/^https?:\/\//, "")}` : undefined,
      githubLogin: d.github_url?.split("/").filter(Boolean).pop(),
      twitterHandle: d.twitter_username,
      title: d.job_title,
      company: d.job_company_name,
      location: d.location_name,
      countryCode: d.location_country?.slice(0, 2).toUpperCase(),
      confidence: json.likelihood ? json.likelihood / 10 : undefined,
      rawPayload: json,
    };
  },
};
