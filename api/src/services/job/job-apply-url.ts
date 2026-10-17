/**
 * Single source of truth for deriving the public "apply URL" that
 * job-response payloads expose to the extension.
 *
 * Priority order:
 *
 *   1. `job.applyUrl` — persisted direct-apply link on the job_items
 *      row. Populated at track time (or refresh time) when a distinct
 *      apply URL was detected. Only non-null when it's actually
 *      different from the sourceUrl — the column stores null for the
 *      "we don't have a real apply link yet" case.
 *   2. `parsed.applyUrl` — direct-apply link the extractor just pulled
 *      from the current page (JSON-LD `directApply` / `url` or DOM
 *      apply-button heuristics). Used on /extract and /refresh calls
 *      where we have fresh HTML.
 *   3. `job.sourceUrl` — the URL the job was tracked from. When no
 *      direct-apply link exists, the listing page itself is the
 *      next-best destination.
 *   4. `fallbackUrl` — the URL the client is currently on. Last resort.
 */
export function deriveApplyUrl(args: {
  parsed?: { applyUrl?: string | null };
  job?: { applyUrl?: string | null; sourceUrl?: string | null };
  fallbackUrl?: string | null;
}): string | undefined {
  return (
    args.job?.applyUrl ||
    args.parsed?.applyUrl ||
    args.job?.sourceUrl ||
    args.fallbackUrl ||
    undefined
  );
}

/**
 * True when a job's stored applyUrl is effectively "missing" — either
 * null/empty or identical to its sourceUrl (meaning the persisted
 * value is just the sourceUrl fallback, not a real direct-apply link).
 * Used by computeRefreshBackfill to decide whether a rescan should
 * attempt to replace the stored applyUrl with a fresh candidate.
 */
export function isApplyUrlFallback(row: { applyUrl?: string | null; sourceUrl?: string | null }): boolean {
  const apply = row.applyUrl;
  const source = row.sourceUrl;
  if (apply == null || apply === "") return true;
  if (source && apply === source) return true;
  return false;
}
