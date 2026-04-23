/**
 * Job Board Scraper Service (#86)
 *
 * Called by:
 *   - `scheduled.ts` (Cloudflare Cron Trigger) for all active sources
 *   - `POST /api/admin/job-sources/:id/sync` for manual one-off runs
 *
 * Deduplication: SHA-256 hash of (title.toLowerCase() + company.toLowerCase() + location.toLowerCase())
 * stored in `jobItems.externalId`. Skip if a row with the same externalId already exists.
 *
 * Supported feed types:
 *   - "rss"      — Standard RSS 2.0 / Atom feed; extracts <item> elements
 *   - "json_api" — Arbitrary JSON response; uses `config.itemsPath` + field mapping
 *   - "html"     — Not implemented; falls back to a no-op with an error log
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { type ApiDeps, defaultApiDeps } from "../apiDeps.js";

type Source = typeof schema.jobBoardSources.$inferSelect;

/** Scraper uses the jobs repo for posting inserts + dedup, plus a raw
 *  `db` handle for the sync-log upserts (`jobBoardSyncLog` has no repo
 *  methods yet). Lazy default so test paths that don't invoke scraping
 *  never touch Postgres. */
export interface JobScraperDeps {
  repos: ApiDeps["repos"];
  db: ReturnType<typeof getDb>;
}

const resolveDeps = (deps?: Partial<JobScraperDeps>): JobScraperDeps => ({
  repos: deps?.repos ?? defaultApiDeps().repos,
  db: deps?.db ?? getDb(),
});

// ---------------------------------------------------------------------------
// Entry point — called by cron or manual trigger
// ---------------------------------------------------------------------------
export async function scrapeJobSource(
  source: Source,
  deps?: Partial<JobScraperDeps>,
): Promise<void> {
  const d = resolveDeps(deps);
  const db = d.db;

  // Start a sync log entry
  const [logRow] = await db
    .insert(schema.jobBoardSyncLog)
    .values({
      sourceId: source.id,
      status: "running",
    } as any)
    .returning();

  const logId = logRow.id;
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let errorMessage: string | undefined;

  try {
    const items = await fetchItems(source);
    fetched = items.length;

    for (const item of items) {
      try {
        // Dedup key: prefer the item URL, fallback to hash of title+company+location
        const fingerprint = await hashFingerprint(item.title, item.company, item.location);
        const dedupUrl = item.url ? item.url : `scraper:${fingerprint}`;

        // Check for existing posting with same sourceUrl
        const [existing] = await db
          .select({ id: schema.jobItems.id })
          .from(schema.jobItems)
          .where(eq(schema.jobItems.sourceUrl, dedupUrl))
          .limit(1);

        if (existing) {
          skipped++;
          continue;
        }

        await db.insert(schema.jobItems).values({
          title: item.title,
          description: item.description ?? "",
          company: item.company ?? "Unknown Company",
          location: item.location ?? "",
          jobType: item.jobType ?? "Full-time",
          sourceUrl: dedupUrl,
          isActive: true,
        } as any);

        inserted++;
      } catch {
        errors++;
      }
    }

    // Mark success
    await db
      .update(schema.jobBoardSyncLog)
      .set({
        status: "success",
        completedAt: new Date(),
        fetched,
        inserted,
        skipped,
        errors,
      } as any)
      .where(eq(schema.jobBoardSyncLog.id, logId));
  } catch (err: any) {
    errorMessage = String(err?.message ?? err);
    await db
      .update(schema.jobBoardSyncLog)
      .set({
        status: "error",
        completedAt: new Date(),
        fetched,
        inserted,
        skipped,
        errors,
        errorMessage,
      } as any)
      .where(eq(schema.jobBoardSyncLog.id, logId));
    console.error(`[jobscraper] Source ${source.id} failed:`, errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Batch runner — called from scheduled.ts for all active sources
// ---------------------------------------------------------------------------
export async function scrapeAllActiveSources(deps?: Partial<JobScraperDeps>): Promise<void> {
  const d = resolveDeps(deps);
  const sources = await d.db
    .select()
    .from(schema.jobBoardSources)
    .where(eq(schema.jobBoardSources.isActive, true));

  await Promise.allSettled(sources.map((s) => scrapeJobSource(s, d)));
  console.log(`[jobscraper] Processed ${sources.length} active source(s).`);
}

// ---------------------------------------------------------------------------
// Fetch + parse items from a source
// ---------------------------------------------------------------------------
interface JobItem {
  title: string;
  description?: string;
  company?: string;
  location?: string;
  url?: string;
  jobType?: string;
}

async function fetchItems(source: Source): Promise<JobItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "hired.video JobBot/1.0",
      ...(source.apiKey ? { Authorization: `Bearer ${source.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${source.url}`);
  }

  const config = (source.config ?? {}) as Record<string, unknown>;

  switch (source.type) {
    case "rss":
      return parseRss(await response.text());
    case "json_api":
      return parseJsonApi(await response.json(), config);
    default:
      throw new Error(`Unsupported feed type: ${source.type}`);
  }
}

function parseRss(xml: string): JobItem[] {
  // Lightweight RSS parser — no external deps, works in Cloudflare Workers.
  const items: JobItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];
    const title = extractTag(block, "title");
    if (!title) continue;

    items.push({
      title: cleanCdata(title),
      description: cleanCdata(extractTag(block, "description") ?? ""),
      company: cleanCdata(extractTag(block, "company") ?? extractTag(block, "source") ?? ""),
      location: cleanCdata(extractTag(block, "location") ?? extractTag(block, "georss:point") ?? ""),
      url: cleanCdata(extractTag(block, "link") ?? ""),
      jobType: cleanCdata(extractTag(block, "jobtype") ?? extractTag(block, "category") ?? ""),
    });
  }

  return items;
}

function parseJsonApi(data: unknown, config: Record<string, unknown>): JobItem[] {
  const itemsPath = (config.itemsPath as string) ?? "jobs";
  const mapping = (config.mapping as Record<string, string>) ?? {};

  const raw = resolvePath(data, itemsPath);
  if (!Array.isArray(raw)) return [];

  return raw.map((item: Record<string, unknown>) => ({
    title: String(getField(item, mapping.title ?? "title") ?? ""),
    description: String(getField(item, mapping.description ?? "description") ?? ""),
    company: String(getField(item, mapping.company ?? "company") ?? ""),
    location: String(getField(item, mapping.location ?? "location") ?? ""),
    url: String(getField(item, mapping.url ?? "url") ?? ""),
    jobType: String(getField(item, mapping.jobType ?? "jobType") ?? ""),
  })).filter((j) => j.title.length > 0);
}

// ---------------------------------------------------------------------------
// Deduplication fingerprint (Web Crypto — available in Cloudflare Workers)
// ---------------------------------------------------------------------------
async function hashFingerprint(title: string, company = "", location = ""): Promise<string> {
  const raw = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
  const enc = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 64);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1]?.trim();
}

function cleanCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc, key) => (acc as Record<string, unknown>)?.[key], obj);
}

function getField(obj: Record<string, unknown>, field: string): unknown {
  return resolvePath(obj, field);
}
