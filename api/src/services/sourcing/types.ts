/**
 * Shared types for the sourcing layer.
 *
 * `SourcingQuery` is intentionally a discriminated union — every concrete
 * provider declares which `kind`s it supports via its `capabilities` flags
 * in the integrations row, and the resolver routes accordingly.
 */

export type SourcingQuery =
  | { kind: "email"; value: string }
  | { kind: "linkedin_url"; value: string }
  | { kind: "github_login"; value: string }
  | { kind: "name_company"; name: string; company: string }
  | { kind: "domain"; value: string };

export interface SourcingResult {
  /** True only if the call returned matchable data. */
  found: boolean;
  fullName?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  linkedinUrl?: string;
  githubLogin?: string;
  twitterHandle?: string;
  title?: string;
  company?: string;
  location?: string;
  countryCode?: string;
  /** Verbatim provider response — kept for the provenance log. */
  rawPayload?: unknown;
  /** Optional list of additional identifiers the provider returned. */
  extraIdentifiers?: Array<{ type: string; value: string }>;
  /** Provider-reported confidence 0..1 if exposed. */
  confidence?: number;
  /** ISO-8601 — provider TTL hint, falls back to resolver default. */
  staleAt?: string;
}

/**
 * One row from the integrations registry, hydrated with the runtime env so
 * a provider implementation can read its API key.
 */
export interface ProviderContext {
  /** integrations.id — used when writing to person_sources / runs / cache. */
  integrationId: string;
  /** integrations.slug — stable identifier referenced in code. */
  slug: string;
  /** integrations.cost_per_call_cents — for ledger debits. */
  costPerCallCents: number;
  /** Resolved API key (already looked up by integration_credentials.env_var_name). */
  apiKey: string | null;
  /** Free-form extra credentials (account ID, etc). */
  extra: Record<string, string | null>;
  /** Cloudflare env (or process.env) for additional lookups. */
  env: Record<string, unknown>;
}

export interface SourcingProvider {
  readonly slug: string;
  /**
   * Whether this provider can be invoked given current credentials/env.
   * Resolver short-circuits if false.
   */
  isConfigured(ctx: ProviderContext): boolean;
  /**
   * Whether this provider claims to handle the given query kind.
   * Used by the resolver to route a query to the cheapest capable
   * provider first.
   */
  supports(kind: SourcingQuery["kind"]): boolean;
  /**
   * Make the actual external call. MUST NOT touch the database — the
   * resolver writes through to cache + people tables.
   */
  enrich(ctx: ProviderContext, query: SourcingQuery): Promise<SourcingResult>;
}

export class ProviderError extends Error {
  constructor(
    public readonly slug: string,
    public readonly code: string,
    message: string,
  ) {
    super(`[${slug}] ${code}: ${message}`);
    this.name = "ProviderError";
  }
}
