/**
 * Cache for `GET /api/studio/public?subjectKind=&subjectId=` (a subject's public studio
 * projects) — now read on EVERY job / company page view by the entity canvas
 * (#274/#275), so it is cached.
 *
 * Isolate-only (utils/isolate-cache.ts): the keyspace is one entry per
 * subject (unbounded), and both a KV fill and a KV version-token bump per
 * write would burn the Workers Free write quota the scheduler's work
 * markers depend on. Keyed per subject, so a write drops exactly that
 * subject's entry in its own isolate; other isolates converge within the
 * (short) TTL. Every write that can change the list
 * calls `invalidatePublicProjectsForSubjects` with the subjects it touches:
 * a visibility or status flip, a subject link / unlink, a save of a public
 * project (its design + name change), a subject replace, a delete.
 */
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";

/** Short: invalidation clears the writer's isolate; this bounds the rest. */
export const PUBLIC_PROJECTS_TTL_SECONDS = 60;

export interface CacheSubject {
  kind: string;
  id: string;
}

function namespace(subject: CacheSubject): string {
  return `studio:public-projects:${subject.kind}:${subject.id}`;
}

/** The cached list for a subject; `loader` runs on a miss. */
export function getPublicProjectsCached<T>(subject: CacheSubject, loader: () => Promise<T>): Promise<T> {
  return getOrSetIsolateCached({
    key: namespace(subject),
    ttlSeconds: PUBLIC_PROJECTS_TTL_SECONDS,
    loader,
  });
}

/** Drop the cached lists of these subjects (deduped; this isolate). */
export function invalidatePublicProjectsForSubjects(subjects: readonly CacheSubject[]): void {
  const seen = new Set<string>();
  for (const s of subjects) {
    const ns = namespace(s);
    if (seen.has(ns)) continue;
    seen.add(ns);
    invalidateIsolateKey(ns);
  }
}
