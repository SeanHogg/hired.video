/**
 * #96 — Contact enrichment provider abstraction.
 *
 * The credit ledger already exists (`enrichmentCredits` +
 * `enrichmentTransactions`); what was missing is the seam every
 * upstream provider gets plugged into so the credit-deduction path
 * never has to know who is fulfilling the lookup. Today we ship one
 * implementation — `NullEnrichmentProvider` — which records every
 * attempt to `enrichment_provider_calls` and returns an empty record
 * so the existing route surface stays honest about "we charged you a
 * credit but the upstream is still being wired."
 *
 * Adding a real provider is one file: implement `EnrichmentProvider`,
 * wire it in `getActiveProvider()`, choose it via env. The route never
 * changes. PeopleDataLabs, Hunter.io, Apollo, ZoomInfo are all good
 * candidates; the per-provider HTTP shape lives entirely behind this
 * interface.
 *
 * Per-attempt audit: every call writes one `enrichment_provider_calls`
 * row regardless of outcome. Frees the route from leaking provider
 * choice into the credit-deduction code path AND gives us drift
 * detection (provider 400s spike = something changed upstream).
 */

import { getDb, schema } from "../../db/index.js";
import { HunterEnrichmentProvider } from "./hunter.js";

const { enrichmentProviderCalls } = schema;

export interface EnrichmentInput {
  email?: string;
  name?: string;
  company?: string;
  domain?: string;
}

export interface EnrichmentResult {
  email: string | null;
  name: string | null;
  company: string | null;
  domain: string | null;
  linkedInUrl: string | null;
  phone: string | null;
  title: string | null;
  enriched: boolean;
}

export interface EnrichmentProvider {
  readonly name: string;
  enrich(input: EnrichmentInput): Promise<{
    result: EnrichmentResult;
    httpStatus?: number;
    responseExcerpt?: string;
    errorMessage?: string;
  }>;
}

class NullEnrichmentProvider implements EnrichmentProvider {
  readonly name = "null";

  async enrich(input: EnrichmentInput) {
    return {
      result: {
        email: input.email ?? null,
        name: input.name ?? null,
        company: input.company ?? null,
        domain: input.domain ?? null,
        linkedInUrl: null,
        phone: null,
        title: null,
        enriched: false,
      },
      httpStatus: undefined,
      responseExcerpt: "ENRICHMENT_PROVIDER not configured",
    };
  }
}

let cachedProvider: EnrichmentProvider | null = null;

export function getActiveEnrichmentProvider(): EnrichmentProvider {
  if (cachedProvider) return cachedProvider;
  // The selector is intentionally trivial — env-driven, no DI. Future
  // providers (PeopleDataLabs, Hunter, Apollo) plug in here and the
  // route layer doesn't change.
  const choice = (process.env.ENRICHMENT_PROVIDER ?? "null").toLowerCase();
  switch (choice) {
    case "hunter":
      cachedProvider = new HunterEnrichmentProvider();
      break;
    default:
      cachedProvider = new NullEnrichmentProvider();
  }
  return cachedProvider;
}

/** Test seam: swap the provider for fake/spy implementations. */
export function __setActiveEnrichmentProvider(p: EnrichmentProvider): void {
  cachedProvider = p;
}

/**
 * Enrich + audit. Always writes one `enrichment_provider_calls` row.
 * The caller is responsible for the credit-deduction ledger — this
 * service is pure provider-side; it stays decoupled from credit math
 * so a future "free trial enrichment" flow doesn't have to fork the
 * provider call.
 */
export async function enrichAndAudit(
  userId: string,
  input: EnrichmentInput,
  creditsConsumed: number,
): Promise<EnrichmentResult> {
  const provider = getActiveEnrichmentProvider();
  const start = Date.now();
  let auditOk = true;
  let httpStatus: number | undefined;
  let excerpt: string | undefined;
  let errorMessage: string | undefined;
  let result: EnrichmentResult;
  try {
    const r = await provider.enrich(input);
    result = r.result;
    httpStatus = r.httpStatus;
    excerpt = r.responseExcerpt;
    errorMessage = r.errorMessage;
    auditOk = result.enriched;
  } catch (err) {
    auditOk = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    result = {
      email: input.email ?? null,
      name: input.name ?? null,
      company: input.company ?? null,
      domain: input.domain ?? null,
      linkedInUrl: null,
      phone: null,
      title: null,
      enriched: false,
    };
  }
  const db = getDb();
  await db
    .insert(enrichmentProviderCalls)
    .values({
      userId,
      provider: provider.name,
      targetEmail: input.email ?? null,
      targetDomain: input.domain ?? input.company ?? null,
      ok: auditOk,
      httpStatus: httpStatus ?? null,
      creditsConsumed,
      responseExcerpt: excerpt ? excerpt.slice(0, 2_000) : null,
      errorMessage: errorMessage ? errorMessage.slice(0, 2_000) : null,
    })
    .catch((err) => {
      // Audit must never break the user-facing call.
      console.warn("[enrichment] audit insert failed", err, { elapsedMs: Date.now() - start });
    });
  return result;
}
