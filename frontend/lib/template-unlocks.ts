// Template ownership store — server-truth, localStorage-cached.
//
// History: this file used to be localStorage-only ("first pass") with a TODO
// to wire `templateLicenses` once the backend marketplace shipped. That's
// now done — `template_licenses` is the canonical ledger and the API at
// `GET /api/studio/templates/licenses/me` returns the caller's grants. We
// still keep a localStorage cache so:
//   • UI components can answer `isTemplateUnlocked(id)` synchronously
//   • Logged-out / network-offline browsing keeps working
//   • The post-checkout "unlock now" path doesn't need to round-trip before
//     the user navigates away
//
// Server reconciliation happens via `refreshUnlockedTemplatesFromServer()`,
// which the auth bootstrap and post-purchase fulfilment both call.

import { apiClient } from "./api-client";

const KEY = "hired.unlocked_templates.v1";

type TemplateKind = "resume" | "job" | "studio";

type LicenseRow = {
  templateKind: TemplateKind;
  templateId: string;
};

/** Encode the (kind, id) pair as the cache string. The legacy resume/job
 *  cart flow stores bare descriptor ids — we keep accepting that form on
 *  read so old localStorage entries aren't orphaned, but write the prefixed
 *  form going forward to keep kinds disambiguated. */
function encode(kind: TemplateKind, id: string): string {
  return `${kind}:${id}`;
}

/** Match an entry against a query without forcing callers to know whether
 *  the entry was written with or without the prefix. */
function entryMatches(entry: string, kind: TemplateKind, id: string): boolean {
  if (entry === id) return true;            // legacy bare id
  if (entry === encode(kind, id)) return true;
  return false;
}

function readCache(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeCache(entries: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — ignore, server is still the source of truth */
  }
}

// ─── Reads (sync, cache-backed) ─────────────────────────────────────────────

export function getUnlockedTemplates(): string[] {
  return readCache();
}

export function isTemplateUnlocked(templateId: string, kind: TemplateKind = "resume"): boolean {
  const cache = readCache();
  return cache.some((entry) => entryMatches(entry, kind, templateId));
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/** Optimistically mark a template as unlocked in the local cache. Callers
 *  that have a server payment receipt should also call
 *  `recordPurchaseOnServer()` so the grant survives logout / device change. */
export function unlockTemplate(templateId: string, kind: TemplateKind = "resume"): void {
  const current = readCache();
  const encoded = encode(kind, templateId);
  if (current.some((entry) => entryMatches(entry, kind, templateId))) return;
  writeCache([...current, encoded]);
  window.dispatchEvent(
    new CustomEvent("hired:template-unlocked", { detail: { templateId, kind } }),
  );
}

// ─── Server reconciliation ──────────────────────────────────────────────────

/** Fetch the caller's owned-template ledger and rehydrate the cache.
 *  Failure (offline, 401) is non-fatal — the old cache stays in place. */
export async function refreshUnlockedTemplatesFromServer(): Promise<string[]> {
  try {
    const res = await apiClient.get<LicenseRow[]>("/api/studio/templates/licenses/me");
    const rows = (res?.data ?? []) as LicenseRow[];
    const entries = rows.map((r) => encode(r.templateKind, r.templateId));
    writeCache(entries);
    window.dispatchEvent(new CustomEvent("hired:template-unlocks-refreshed"));
    return entries;
  } catch {
    return readCache();
  }
}

/** Record a paid grant on the server. Idempotent thanks to the unique
 *  index on (user_id, template_kind, template_id). Call from the checkout
 *  success path right after the localStorage `unlockTemplate` so the
 *  grant survives logout. */
export async function recordPurchaseOnServer(input: {
  templateId: string;
  /** 'studio' for every creator template (résumé ones included); 'resume'
   *  is a legacy read-only kind the API no longer grants. */
  kind: Exclude<TemplateKind, "resume">;
  pricePaidCents: number;
  paymentRef?: string | null;
}): Promise<void> {
  try {
    await apiClient.post("/api/studio/templates/license", {
      templateKind: input.kind,
      templateId: input.templateId,
      pricePaidCents: input.pricePaidCents,
      paymentRef: input.paymentRef ?? null,
    });
  } catch {
    /* server-truth is best-effort here; the local unlock still applies and
       the next refresh will rebuild the cache from whatever the server
       eventually persists via webhooks. */
  }
}
