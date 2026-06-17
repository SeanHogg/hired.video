/**
 * Hunter.io enrichment provider (#1758).
 *
 * The first REAL implementation of the `EnrichmentProvider` seam (the
 * abstraction + null provider shipped in #96). Hunter's Email Finder maps
 * cleanly onto our `EnrichmentInput`: given a person's name + a company
 * domain it returns the most likely work email plus a confidence score.
 *
 *   GET https://api.hunter.io/v2/email-finder
 *       ?domain={domain}&first_name={fn}&last_name={ln}&api_key={key}
 *   → 200 { data: { email, score, first_name, last_name, position,
 *                    company, linkedin_url, phone_number, domain } }
 *   → 4xx { errors: [{ id, code, details }] }
 *
 * Activation: set `ENRICHMENT_PROVIDER=hunter` + `HUNTER_API_KEY`. With
 * no key the provider reports `enriched:false` + a CONFIG excerpt rather
 * than throwing, so the audit row stays honest (the route still records
 * the attempt) — same contract as `NullEnrichmentProvider`.
 *
 * Parsing is defensive: any unexpected response shape degrades to
 * `enriched:false` instead of crashing the credit-deduction path. Live
 * validation against a real Hunter account is pending an API key (ops),
 * but request construction + response/error mapping are unit-tested
 * against a mocked fetch.
 */

import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "./index.js";

const HUNTER_BASE = "https://api.hunter.io/v2/email-finder";

function readKey(): string | null {
  return (
    process.env.HUNTER_API_KEY ??
    (globalThis as any).__ENV?.HUNTER_API_KEY ??
    null
  );
}

/** Split a free-form name into first/last for Hunter's required params. */
export function splitName(name: string | undefined): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

/** Pure: derive the lookup domain from explicit domain or a company name
 *  that already looks like a domain. Returns null when we have nothing to
 *  query on (Hunter requires a domain OR company). */
export function resolveDomain(input: EnrichmentInput): string | null {
  if (input.domain && input.domain.trim()) return input.domain.trim();
  const company = input.company?.trim();
  if (!company) return null;
  // A company value that's already a bare domain ("acme.com") is usable;
  // a display name ("Acme Inc") is passed as Hunter's `company` param.
  return /\.[a-z]{2,}$/i.test(company) ? company : null;
}

/** Pure: build the Hunter request URL for an input + key. Exported for tests. */
export function buildHunterUrl(input: EnrichmentInput, apiKey: string): string {
  const { first, last } = splitName(input.name);
  const params = new URLSearchParams({ api_key: apiKey });
  const domain = resolveDomain(input);
  if (domain) params.set("domain", domain);
  else if (input.company?.trim()) params.set("company", input.company.trim());
  if (first) params.set("first_name", first);
  if (last) params.set("last_name", last);
  return `${HUNTER_BASE}?${params.toString()}`;
}

/** Pure: map a Hunter `data` object onto our EnrichmentResult. Exported
 *  for tests. Unknown/empty shapes → enriched:false. */
export function mapHunterData(input: EnrichmentInput, data: unknown): EnrichmentResult {
  const d = (data ?? {}) as Record<string, any>;
  const email = typeof d.email === "string" && d.email.length > 0 ? d.email : null;
  return {
    email: email ?? input.email ?? null,
    name:
      [d.first_name, d.last_name].filter(Boolean).join(" ").trim() ||
      input.name ||
      null,
    company: (typeof d.company === "string" && d.company) || input.company || null,
    domain: (typeof d.domain === "string" && d.domain) || input.domain || null,
    linkedInUrl: typeof d.linkedin_url === "string" ? d.linkedin_url : null,
    phone: typeof d.phone_number === "string" ? d.phone_number : null,
    title: typeof d.position === "string" ? d.position : null,
    // "Enriched" means we actually resolved a new email for the person.
    enriched: email !== null,
  };
}

export class HunterEnrichmentProvider implements EnrichmentProvider {
  readonly name = "hunter";

  async enrich(input: EnrichmentInput) {
    const apiKey = readKey();
    if (!apiKey) {
      return {
        result: mapHunterData(input, null),
        responseExcerpt: "HUNTER_API_KEY not configured",
      };
    }

    let res: Response;
    try {
      res = await fetch(buildHunterUrl(input, apiKey), {
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      return {
        result: mapHunterData(input, null),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }

    const text = await res.text().catch(() => "");
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body — keep an excerpt for drift detection.
    }

    if (!res.ok) {
      const detail =
        body?.errors?.[0]?.details ?? body?.errors?.[0]?.code ?? text.slice(0, 500);
      return {
        result: mapHunterData(input, null),
        httpStatus: res.status,
        responseExcerpt: typeof detail === "string" ? detail : JSON.stringify(detail),
        errorMessage: `Hunter ${res.status}`,
      };
    }

    return {
      result: mapHunterData(input, body?.data),
      httpStatus: res.status,
      responseExcerpt: text.slice(0, 500),
    };
  }
}
