/**
 * Cache for `GET /api/studio/public?subjectKind=&subjectId=` (a subject's public studio
 * projects) — now read on EVERY job / company page view by the entity canvas
 * (#274/#275), so it goes through the two-layer edge cache.
 *
 * Keyed per subject with a version token (`getCacheVersion`), so a write
 * orphans exactly that subject's entry. Every write that can change the list
 * calls `invalidatePublicProjectsForSubjects` with the subjects it touches:
 * a visibility or status flip, a subject link / unlink, a save of a public
 * project (its design + name change), a subject replace, a delete.
 */
import { bumpCacheVersion, getCacheVersion, getOrSetCached } from "../../utils/edge-cache.js";

/** L2 TTL — short; invalidation is the primary freshness mechanism. */
export const PUBLIC_PROJECTS_TTL_SECONDS = 120;

export interface CacheSubject {
  kind: string;
  id: string;
}

function namespace(subject: CacheSubject): string {
  return `studio:public-projects:${subject.kind}:${subject.id}`;
}

/** The cached list for a subject; `loader` runs on a miss. */
export async function getPublicProjectsCached<T>(subject: CacheSubject, loader: () => Promise<T>): Promise<T> {
  const version = await getCacheVersion(namespace(subject));
  return getOrSetCached({
    key: `${namespace(subject)}:v${version}`,
    ttlSeconds: PUBLIC_PROJECTS_TTL_SECONDS,
    loader,
  });
}

/** Orphan the cached lists of these subjects (deduped; fire-and-forget). */
export function invalidatePublicProjectsForSubjects(subjects: readonly CacheSubject[]): void {
  const seen = new Set<string>();
  for (const s of subjects) {
    const ns = namespace(s);
    if (seen.has(ns)) continue;
    seen.add(ns);
    bumpCacheVersion(ns);
  }
}
