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

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

interface VectorizeBindings {
  vectorize: VectorizeIndex;
  ai: { run: (model: string, inputs: Record<string, unknown>) => Promise<unknown> };
}

/** Resolve the Vectorize + AI bindings, or null when either is absent. */
export function getVectorizeBindings(): VectorizeBindings | null {
  const env = (globalThis as any).__ENV as
    | { VECTORIZE?: VectorizeIndex; AI?: VectorizeBindings["ai"] }
    | undefined;
  if (!env?.VECTORIZE || !env?.AI) return null;
  return { vectorize: env.VECTORIZE, ai: env.AI };
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
    const out = (await ai.run(EMBEDDING_MODEL, { text: [text] })) as {
      data?: number[][];
    };
    const vec = out?.data?.[0];
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch {
    return null;
  }
}

/** Upsert one help article's embedding. Best-effort no-op when bindings
 *  are absent or embedding fails — callers never depend on the result. */
export async function upsertHelpEmbedding(input: {
  articleId: string;
  kind: string;
  title: string;
  summary: string;
  body: string;
}): Promise<void> {
  const b = getVectorizeBindings();
  if (!b) return;
  const text = [input.title, input.summary, input.body]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  const values = await embed(b.ai, text);
  if (!values) return;
  try {
    await b.vectorize.upsert([
      { id: input.articleId, values, metadata: { kind: input.kind } },
    ]);
  } catch {
    /* best-effort */
  }
}

/** Remove an article's embedding (on unpublish / delete). */
export async function deleteHelpEmbedding(articleId: string): Promise<void> {
  const b = getVectorizeBindings();
  if (!b) return;
  try {
    await b.vectorize.deleteByIds([articleId]);
  } catch {
    /* best-effort */
  }
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
