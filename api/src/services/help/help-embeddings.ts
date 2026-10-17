/**
 * Semantic help search — embeddings layer (#2004, Phase 2).
 *
 * Vectors live in **Cloudflare Vectorize** and embeddings come from
 * **Workers AI** (`@cf/baai/bge-base-en-v1.5`, 768-dim). Neon is
 * deliberately NOT used for vectors — its storage is capped, and this
 * keeps all vector load off the relational DB at zero marginal cost
 * (both are free-tier on the Workers stack).
 *
 * Graceful degradation is the contract: every export feature-detects the
 * `VECTORIZE` + `AI` bindings and no-ops (or signals the caller to fall
 * back) when they're absent — so local dev, preview deploys, and any
 * environment that hasn't provisioned the index keep working on the
 * keyword (ILIKE) path. Activating semantic search is purely an ops step:
 * create the `help-content` Vectorize index, bind `VECTORIZE` + `AI`, then
 * call `POST /api/help/reindex` once to backfill.
 *
 * The mapping/curation per-page help does NOT use this — that stays
 * explicit (precision). Embeddings power free-text SEARCH only.
 */

import {
  WORKERS_AI_EMBEDDING_MODEL,
  resolveWorkersAi,
  runWorkersAi,
  type WorkersAiBinding,
} from "../adapters/workers-ai.js";

// Embeddings stay on Workers AI rather than the gateway's `embeddings` API:
// the `help-content` index is 768-dim bge-base vectors (a different model
// would need a new index + full reindex), and these calls have no billed
// user (reindex is an admin/system job, search may be anonymous) — so they
// run through the shared Workers AI adapter without a meter.

interface VectorizeBindings {
  vectorize: VectorizeIndex;
  ai: WorkersAiBinding;
}

/** Resolve the Vectorize + AI bindings, or null when either is absent. */
export function getVectorizeBindings(): VectorizeBindings | null {
  const env = (globalThis as { __ENV?: { VECTORIZE?: VectorizeIndex } }).__ENV;
  const ai = resolveWorkersAi(undefined);
  if (!env?.VECTORIZE || !ai) return null;
  return { vectorize: env.VECTORIZE, ai };
}

/** True when semantic search can run in this environment. */
export function isSemanticHelpAvailable(): boolean {
  return getVectorizeBindings() !== null;
}

/** Embed a single string to a 768-dim vector, or null on any failure. */
async function embed(
  ai: VectorizeBindings["ai"],
  text: string,
): Promise<number[] | null> {
  try {
    const out = (await runWorkersAi(ai, WORKERS_AI_EMBEDDING_MODEL, { text: [text] })) as {
      data?: number[][];
    };
    const vec = out?.data?.[0];
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch {
    return null;
  }
}

/** Upsert one help item's embedding, keyed by content slug. Best-effort
 *  no-op when bindings are absent or embedding fails — callers never depend
 *  on the result. The text is embedded then discarded; it is never stored. */
export async function upsertHelpEmbedding(input: {
  slug: string;
  text: string;
}): Promise<void> {
  const b = getVectorizeBindings();
  if (!b) return;
  const values = await embed(b.ai, input.text.slice(0, 4000));
  if (!values) return;
  try {
    await b.vectorize.upsert([{ id: input.slug, values }]);
  } catch {
    /* best-effort */
  }
}

/** Delete embeddings by slug (e.g. items removed from the catalog). Wired
 *  by the reindex prune step (#2076). Best-effort no-op without bindings. */
export async function deleteHelpEmbeddings(slugs: string[]): Promise<void> {
  const b = getVectorizeBindings();
  if (!b || slugs.length === 0) return;
  try {
    await b.vectorize.deleteByIds(slugs);
  } catch {
    /* best-effort */
  }
}

// ── Indexed-slug ledger (KV) ──────────────────────────────────────────
// Vectorize has no cheap "list all ids", so reindex tracks the set of
// slugs it has indexed in KV; the next reindex diffs against it to prune
// vectors for slugs that no longer exist in the bundled catalog (#2076).
const INDEXED_SLUGS_KEY = "help:indexed-slugs";

function getKv(): KVNamespace | undefined {
  return (globalThis as any).__ENV?.KV_CACHE as KVNamespace | undefined;
}

/** The slugs indexed by the last reindex (empty when unknown / evicted). */
export async function getIndexedHelpSlugs(): Promise<string[]> {
  const kv = getKv();
  if (!kv) return [];
  const raw = await kv.get(INDEXED_SLUGS_KEY, "json").catch(() => null);
  return Array.isArray(raw) ? (raw as string[]) : [];
}

/** Record the current indexed slug set (persisted, no TTL). */
export async function recordIndexedHelpSlugs(slugs: string[]): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  await kv.put(INDEXED_SLUGS_KEY, JSON.stringify(slugs)).catch(() => undefined);
}

/** Semantic KNN over help content. Returns ranked article ids, or null
 *  when semantic search is unavailable (caller falls back to keyword). */
export async function semanticSearchHelpIds(
  query: string,
  topK = 12,
): Promise<string[] | null> {
  const b = getVectorizeBindings();
  if (!b) return null;
  const values = await embed(b.ai, query);
  if (!values) return null;
  try {
    const res = (await b.vectorize.query(values, { topK })) as {
      matches?: Array<{ id: string }>;
    };
    return (res.matches ?? []).map((m) => m.id);
  } catch {
    return null;
  }
}
