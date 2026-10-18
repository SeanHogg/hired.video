/**
 * ATS provider candidate adapters (#64) — pull candidates from Greenhouse
 * (Harvest), Lever and Workday (RaaS), and pull a candidate + stage out of an
 * inbound webhook payload. Pure HTTP/shape mapping: no DB access.
 */

export const SUPPORTED_ATS_PROVIDERS = ["greenhouse", "lever", "workday"] as const;
export type AtsProvider = typeof SUPPORTED_ATS_PROVIDERS[number];

export function isAtsProvider(value: string): value is AtsProvider {
  return (SUPPORTED_ATS_PROVIDERS as readonly string[]).includes(value);
}

/** One ATS candidate flattened to the fields talent_pool_candidates needs. */
export type NormalizedCandidate = {
  name: string;
  email: string | null;
  title: string | null;
  company: string | null;
};

/** ATS REST keys auth as HTTP Basic with the key as username + empty password
 *  (Greenhouse Harvest + Lever both use this). */
function basicAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

const PROVIDER_PAGE_SIZE = 100;
const PROVIDER_MAX_PAGES = 2; // bound a single sync to ≤200 candidates

export async function fetchGreenhouseCandidates(apiKey: string): Promise<NormalizedCandidate[]> {
  const out: NormalizedCandidate[] = [];
  for (let page = 1; page <= PROVIDER_MAX_PAGES; page++) {
    const res = await fetch(
      `https://harvest.greenhouse.io/v1/candidates?per_page=${PROVIDER_PAGE_SIZE}&page=${page}`,
      { headers: { Authorization: basicAuthHeader(apiKey), "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`Greenhouse ${res.status}`);
    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "(unnamed)";
      const email = r.email_addresses?.find((e: any) => e?.value)?.value ?? null;
      out.push({
        name,
        email: email ? String(email) : null,
        title: r.title ? String(r.title) : null,
        company: r.company ? String(r.company) : null,
      });
    }
    if (rows.length < PROVIDER_PAGE_SIZE) break;
  }
  return out;
}

export async function fetchLeverCandidates(apiKey: string): Promise<NormalizedCandidate[]> {
  const out: NormalizedCandidate[] = [];
  let next: string | undefined;
  for (let page = 0; page < PROVIDER_MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PROVIDER_PAGE_SIZE) });
    if (next) params.set("offset", next);
    const res = await fetch(`https://api.lever.co/v1/opportunities?${params.toString()}`, {
      headers: { Authorization: basicAuthHeader(apiKey), "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Lever ${res.status}`);
    const body = (await res.json()) as { data?: any[]; hasNext?: boolean; next?: string };
    const rows = body.data ?? [];
    for (const r of rows) {
      out.push({
        name: r.name ? String(r.name) : "(unnamed)",
        email: Array.isArray(r.emails) && r.emails[0] ? String(r.emails[0]) : null,
        title: r.headline ? String(r.headline) : null,
        company: r.headline ? String(r.headline) : null,
      });
    }
    if (!body.hasNext || !body.next) break;
    next = body.next;
  }
  return out;
}

/**
 * Workday Recruiting has no single REST candidates endpoint — integration is
 * per-tenant via Report-as-a-Service (RaaS). The connection stores the full
 * RaaS report URL + ISU username in `config`; `apiKey` is the ISU password.
 * RaaS returns `{ Report_Entry: [...] }` when `?format=json` is appended.
 * Because report field names are tenant-defined, callers may supply
 * `config.fieldMap` to override the defaults below.
 */
export async function fetchWorkdayCandidates(
  password: string,
  config: Record<string, unknown>,
): Promise<NormalizedCandidate[]> {
  const raasUrl = typeof config.raasUrl === "string" ? config.raasUrl : "";
  const username = typeof config.username === "string" ? config.username : "";
  if (!raasUrl || !username) {
    throw new Error("Workday requires config.raasUrl + config.username");
  }
  const url = `${raasUrl}${raasUrl.includes("?") ? "&" : "?"}format=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Workday ${res.status}`);
  const data = (await res.json()) as { Report_Entry?: any[] };
  const rows = Array.isArray(data.Report_Entry) ? data.Report_Entry : [];
  const fieldMap = (config.fieldMap ?? {}) as Record<string, string>;

  const pick = (r: any, key: string, fallbacks: string[]): string | null => {
    const keys = [fieldMap[key], ...fallbacks].filter(Boolean) as string[];
    for (const k of keys) {
      if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
    }
    return null;
  };

  return rows
    .slice(0, PROVIDER_PAGE_SIZE * PROVIDER_MAX_PAGES)
    .map((r) => ({
      name: pick(r, "name", ["candidateName", "Candidate", "Worker", "fullName", "Full_Name", "Legal_Name"]) ?? "(unnamed)",
      email: pick(r, "email", ["email", "Email", "emailAddress", "Email_Address", "primaryEmail", "Primary_Email"]),
      title: pick(r, "title", ["title", "Title", "jobTitle", "Job_Title", "currentTitle", "Job_Profile"]),
      company: pick(r, "company", ["company", "Company", "currentCompany", "Current_Company", "employer", "Employer"]),
    }));
}

/** Best-effort candidate extraction from a provider webhook payload. Returns
 *  null when the event carries no identifiable candidate (the shapes are thin
 *  and vary by event type, so every access is defensive). */
export function extractCandidateFromWebhook(provider: AtsProvider, body: any): NormalizedCandidate | null {
  if (provider === "greenhouse") {
    const p = body.payload ?? {};
    const cand = p.candidate ?? p.application?.candidate ?? null;
    if (!cand) return null;
    const name = [cand.first_name, cand.last_name].filter(Boolean).join(" ").trim() || cand.name || "(unnamed)";
    const email = cand.email_addresses?.find((e: any) => e?.value)?.value ?? cand.email ?? null;
    return {
      name,
      email: email ? String(email) : null,
      title: cand.title ?? p.application?.jobs?.[0]?.name ?? null,
      company: cand.company ?? null,
    };
  }
  if (provider === "lever") {
    const d = body.data ?? body ?? {};
    const cand = d.contact ?? d.candidate ?? d.opportunity ?? d;
    const name = cand?.name ? String(cand.name) : null;
    const email = Array.isArray(cand?.emails) && cand.emails[0] ? String(cand.emails[0]) : (cand?.email ?? null);
    if (!name && !email) return null;
    return {
      name: name ?? "(unnamed)",
      email: email ? String(email) : null,
      title: cand?.headline ? String(cand.headline) : null,
      company: cand?.headline ? String(cand.headline) : null,
    };
  }
  return null;
}

/** Best-effort pipeline-stage extraction (for the interaction note). */
export function extractStageFromWebhook(provider: AtsProvider, body: any): string | null {
  if (provider === "greenhouse") {
    return body.payload?.application?.current_stage?.name ?? null;
  }
  if (provider === "lever") {
    return body.data?.toStage?.text ?? body.data?.toStageId ?? null;
  }
  return null;
}
