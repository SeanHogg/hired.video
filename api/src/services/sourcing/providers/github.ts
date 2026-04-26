/**
 * GitHub — public developer profiles.
 *
 * Endpoint: https://api.github.com/users/{login}
 * Auth: optional bearer token (raises rate limit from 60/hr → 5,000/hr).
 * Cost: free.
 *
 * Best free signal for engineering roles — no card required to start.
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingResult } from "../types.js";

interface GitHubUser {
  login: string;
  name?: string;
  email?: string;
  bio?: string;
  blog?: string;
  company?: string;
  location?: string;
  twitter_username?: string;
  html_url: string;
}

export const githubProvider: SourcingProvider = {
  slug: "github",

  isConfigured(_ctx) {
    // GitHub works without auth; only the rate limit changes.
    return true;
  },

  supports(kind) {
    return kind === "github_login";
  },

  async enrich(ctx, query) {
    if (query.kind !== "github_login") return { found: false };

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hired.video-sourcing",
    };
    if (ctx.apiKey) headers.Authorization = `Bearer ${ctx.apiKey}`;

    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(query.value)}`, { headers });

    if (res.status === 404) return { found: false };
    if (res.status === 403) {
      throw new ProviderError(this.slug, "RATE_LIMITED", "GitHub rate limit (configure GITHUB_TOKEN to raise)");
    }
    if (!res.ok) {
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status}`);
    }

    const u = (await res.json()) as GitHubUser;
    const cleanCompany = u.company?.replace(/^@/, "");

    return {
      found: true,
      fullName: u.name ?? u.login,
      email: u.email ?? undefined,
      githubLogin: u.login,
      linkedinUrl: u.blog && /linkedin\.com/i.test(u.blog) ? u.blog : undefined,
      twitterHandle: u.twitter_username ?? undefined,
      company: cleanCompany,
      location: u.location ?? undefined,
      title: u.bio ?? undefined,
      rawPayload: u,
    };
  },
};
