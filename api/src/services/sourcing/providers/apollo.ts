/**
 * Apollo.io — B2B contact enrich + email finder.
 *
 * Endpoint: https://api.apollo.io/v1/people/match
 * Auth: header `X-Api-Key`.
 * Cost: credits-based, freemium tier.
 *
 * Used as a price-competitive alternative to PDL with strong B2B coverage.
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingQuery, type SourcingResult } from "../types.js";

const BASE = "https://api.apollo.io/v1/people/match";

interface ApolloPerson {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin_url?: string;
  github_url?: string;
  twitter_url?: string;
  title?: string;
  organization?: { name?: string };
  city?: string;
  state?: string;
  country?: string;
}

export const apolloProvider: SourcingProvider = {
  slug: "apollo",

  isConfigured(ctx) {
    return !!ctx.apiKey;
  },

  supports(kind) {
    return kind === "email" || kind === "linkedin_url" || kind === "name_company";
  },

  async enrich(ctx, query) {
    if (!ctx.apiKey) {
      throw new ProviderError(this.slug, "NO_CREDENTIALS", "APOLLO_API_KEY not configured");
    }

    const body: Record<string, unknown> = {};
    if (query.kind === "email") body.email = query.value;
    else if (query.kind === "linkedin_url") body.linkedin_url = query.value;
    else if (query.kind === "name_company") {
      body.name = query.name;
      body.organization_name = query.company;
    } else {
      return { found: false };
    }

    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": ctx.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) throw new ProviderError(this.slug, "RATE_LIMITED", "Apollo rate-limited");
      const text = await res.text().catch(() => "");
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status} ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { person?: ApolloPerson };
    const p = json.person;
    if (!p) return { found: false, rawPayload: json };

    const githubLogin = p.github_url?.split("/").filter(Boolean).pop();
    const twitterHandle = p.twitter_url?.split("/").filter(Boolean).pop()?.replace(/^@/, "");
    const location = [p.city, p.state, p.country].filter(Boolean).join(", ") || undefined;

    return {
      found: true,
      fullName: p.name,
      givenName: p.first_name,
      familyName: p.last_name,
      email: p.email,
      linkedinUrl: p.linkedin_url,
      githubLogin,
      twitterHandle,
      title: p.title,
      company: p.organization?.name,
      location,
      countryCode: p.country?.slice(0, 2).toUpperCase(),
      rawPayload: json,
    };
  },
};
