/**
 * Cached read side of the workspace taxonomies (Tags / Job Types /
 * Sources — #231, #232, #238).
 *
 * The lists are tiny, platform-wide (workspace scoping not yet applied —
 * see routes/taxonomies.ts) and change only through the taxonomy write
 * endpoints, which call `invalidateTaxonomyCache(kind)`. Cached through
 * the canonical edge cache; payloads are JSON-safe DTOs (Date columns
 * serialised to ISO strings) so the KV round-trip is lossless.
 */

import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { WorkspaceJobType, WorkspaceSource, WorkspaceTag } from "../../db/schema/taxonomies.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

const { workspaceTags, workspaceJobTypes, workspaceSources } = schema;

export const TAG_AXES = ["company", "job", "person"] as const;
export type TagAxis = (typeof TAG_AXES)[number];

export type TaxonomyKind = "tags" | "job-types" | "sources";

/** Backstop TTL — every write path invalidates explicitly. */
const TAXONOMY_TTL_SECONDS = 600;

export type WorkspaceTagDto = Omit<WorkspaceTag, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
export type WorkspaceJobTypeDto = Omit<WorkspaceJobType, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
export type WorkspaceSourceDto = Omit<WorkspaceSource, "createdAt"> & { createdAt: string };

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function tagsKey(axis: TagAxis | null): string {
  return `taxonomy:v1:tags:${axis ?? "all"}`;
}
const JOB_TYPES_KEY = "taxonomy:v1:job-types";
const SOURCES_KEY = "taxonomy:v1:sources";

export function listTags(axis: TagAxis | null): Promise<WorkspaceTagDto[]> {
  return getOrSetCached({
    key: tagsKey(axis),
    ttlSeconds: TAXONOMY_TTL_SECONDS,
    loader: async () => {
      const db = getDb();
      const baseQuery = db.select().from(workspaceTags);
      const rows = await (axis ? baseQuery.where(eq(workspaceTags.axis, axis)) : baseQuery).orderBy(
        asc(workspaceTags.axis),
        asc(workspaceTags.orderIndex),
        asc(workspaceTags.name),
      );
      return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) }));
    },
  });
}

export function listJobTypes(): Promise<WorkspaceJobTypeDto[]> {
  return getOrSetCached({
    key: JOB_TYPES_KEY,
    ttlSeconds: TAXONOMY_TTL_SECONDS,
    loader: async () => {
      const rows = await getDb()
        .select()
        .from(workspaceJobTypes)
        .orderBy(asc(workspaceJobTypes.orderIndex), asc(workspaceJobTypes.label));
      return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) }));
    },
  });
}

export function listSources(): Promise<WorkspaceSourceDto[]> {
  return getOrSetCached({
    key: SOURCES_KEY,
    ttlSeconds: TAXONOMY_TTL_SECONDS,
    loader: async () => {
      const rows = await getDb()
        .select()
        .from(workspaceSources)
        .orderBy(asc(workspaceSources.orderIndex), asc(workspaceSources.label));
      return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) }));
    },
  });
}

/** Drop every cached list for a taxonomy kind. Call from EVERY write that
 *  creates / updates / deletes a row of that kind. */
export function invalidateTaxonomyCache(kind: TaxonomyKind): void {
  if (kind === "tags") {
    invalidateCachedKey(tagsKey(null));
    for (const axis of TAG_AXES) invalidateCachedKey(tagsKey(axis));
  } else if (kind === "job-types") {
    invalidateCachedKey(JOB_TYPES_KEY);
  } else {
    invalidateCachedKey(SOURCES_KEY);
  }
}
