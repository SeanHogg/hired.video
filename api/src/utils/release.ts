/**
 * Which deployed Worker version is serving this request / cron tick.
 *
 * Backed by Cloudflare's `version_metadata` binding (`CF_VERSION_METADATA`
 * in wrangler.toml), so the id is the real deployed version — not a string
 * someone has to remember to bump. Every request_logs row, every structured
 * log line and every config snapshot carries it, which is what lets a log
 * query answer "is the latest code live, and is it working?".
 *
 * Returns null in local dev / tests where the binding is absent.
 */
export interface ReleaseInfo {
  id: string;
  tag: string | null;
  deployedAt: string | null;
}

interface VersionMetadataBinding {
  id?: string;
  tag?: string;
  timestamp?: string;
}

/** The slice of the global env stash (`globalThis.__ENV`) this reads. */
interface ReleaseGlobal {
  __ENV?: { CF_VERSION_METADATA?: VersionMetadataBinding };
}

export function getRelease(): ReleaseInfo | null {
  const meta = (globalThis as ReleaseGlobal).__ENV?.CF_VERSION_METADATA;
  if (!meta?.id) return null;
  return { id: meta.id, tag: meta.tag || null, deployedAt: meta.timestamp || null };
}
