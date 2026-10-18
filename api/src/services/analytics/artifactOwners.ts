/**
 * artifactOwners.ts — server-side owner resolution for artifact_views.
 *
 * The beacon (`POST /api/analytics/events`, kind `artifact_view`) stamps
 * owner_user_id at insert, and the analytics read endpoint gates aggregate
 * reads on it — so the owner is NEVER taken from the client.
 *
 * Batched: a beacon carries up to 50 events, so owners are resolved with ONE
 * `IN (…)` query per owner source (studio_projects, resume_information, …)
 * instead of one SELECT per event. `lookupArtifactOwner` is the single-ref
 * convenience over the same code path.
 */
import { inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { isStudioArtifactKind, type ArtifactKind } from "../../../../shared/artifact-views.js";

export interface ArtifactRef {
  kind: ArtifactKind;
  id: string;
}

/** Map key for an (kind, id) pair. */
export function artifactRefKey(kind: ArtifactKind, id: string): string {
  return `${kind}:${id}`;
}

/** Where an artifact kind's owner lives. Every studio MediaKind keys on
 *  studio_projects.id, so they collapse into one source (one query). Kinds
 *  without a reachable entity table read the owner stamp off a prior view. */
export type OwnerSource =
  | { table: "studio_projects" }
  | { table: "resume_information" }
  | { table: "company_profiles" }
  | { table: "users" }
  | { table: "job_items" }
  | { table: "feed_posts" }
  | { table: "artifact_views"; kind: ArtifactKind };

export function ownerSourceFor(kind: ArtifactKind): OwnerSource | null {
  if (isStudioArtifactKind(kind)) return { table: "studio_projects" };
  switch (kind) {
    case "resume":
      return { table: "resume_information" };
    case "company":
      return { table: "company_profiles" };
    case "profile":
      // Profile artifact_id IS the owning user id (users.id).
      return { table: "users" };
    case "job":
      return { table: "job_items" };
    case "post":
      return { table: "feed_posts" };
    case "article":
    case "studio_template":
    case "service":
      return { table: "artifact_views", kind };
    default:
      return null;
  }
}

function sourceKey(s: OwnerSource): string {
  return s.table === "artifact_views" ? `artifact_views:${s.kind}` : s.table;
}

export interface OwnerLookupGroup {
  source: OwnerSource;
  /** Distinct artifact ids to resolve against this source. */
  ids: string[];
  /** The refs (kinds) that resolve through this group. */
  refs: ArtifactRef[];
}

/** Group refs into one lookup per owner source (pure — unit-tested). Kinds
 *  with no source are omitted (their owner resolves to null). */
export function planOwnerLookups(refs: readonly ArtifactRef[]): OwnerLookupGroup[] {
  const groups = new Map<string, OwnerLookupGroup>();
  for (const ref of refs) {
    const source = ownerSourceFor(ref.kind);
    if (!source) continue;
    const key = sourceKey(source);
    let g = groups.get(key);
    if (!g) {
      g = { source, ids: [], refs: [] };
      groups.set(key, g);
    }
    if (!g.ids.includes(ref.id)) g.ids.push(ref.id);
    g.refs.push(ref);
  }
  return [...groups.values()];
}

type Db = ReturnType<typeof getDb>;
interface OwnerRow {
  id: string;
  ownerId: string | null;
}

async function runLookup(db: Db, source: OwnerSource, ids: string[]): Promise<OwnerRow[]> {
  const s = schema;
  switch (source.table) {
    case "studio_projects":
      return db
        .select({ id: s.studioProjects.id, ownerId: s.studioProjects.userId })
        .from(s.studioProjects)
        .where(inArray(s.studioProjects.id, ids));
    case "resume_information":
      return db
        .select({ id: s.resumeInformation.id, ownerId: s.resumeInformation.userId })
        .from(s.resumeInformation)
        .where(inArray(s.resumeInformation.id, ids));
    case "company_profiles":
      return db
        .select({ id: s.companyProfiles.id, ownerId: s.companyProfiles.ownerId })
        .from(s.companyProfiles)
        .where(inArray(s.companyProfiles.id, ids));
    case "users":
      return db
        .select({ id: s.users.id, ownerId: s.users.id })
        .from(s.users)
        .where(inArray(s.users.id, ids));
    case "job_items":
      return db
        .select({ id: s.jobItems.id, ownerId: s.jobItems.postedByUserId })
        .from(s.jobItems)
        .where(inArray(s.jobItems.id, ids));
    case "feed_posts":
      return db
        .select({ id: s.feedPosts.id, ownerId: s.feedPosts.userId })
        .from(s.feedPosts)
        .where(inArray(s.feedPosts.id, ids));
    case "artifact_views": {
      // Owner stamp written by an earlier view of the same artifact. LATERAL
      // + LIMIT 1 per id keeps this an index probe per id (not a scan of
      // every view row of a popular article).
      const idList = sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      );
      const res = await db.execute(sql`
        SELECT v.id::text AS "id", o.owner_user_id::text AS "ownerId"
        FROM unnest(ARRAY[${idList}]::uuid[]) AS v(id)
        LEFT JOIN LATERAL (
          SELECT ${s.artifactViews.ownerUserId} AS owner_user_id
          FROM ${s.artifactViews}
          WHERE ${s.artifactViews.artifactKind} = ${source.kind}
            AND ${s.artifactViews.artifactId} = v.id
            AND ${s.artifactViews.ownerUserId} IS NOT NULL
          LIMIT 1
        ) o ON true
      `);
      return res.rows as unknown as OwnerRow[];
    }
  }
}

/** Resolve owners for many refs with one query per owner source (run in
 *  parallel). Unknown ids / kinds resolve to null. Keyed by artifactRefKey. */
export async function lookupArtifactOwners(
  refs: readonly ArtifactRef[],
  db: Db = getDb(),
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const ref of refs) out.set(artifactRefKey(ref.kind, ref.id), null);
  const groups = planOwnerLookups(refs);
  const results = await Promise.all(groups.map((g) => runLookup(db, g.source, g.ids)));
  groups.forEach((g, i) => {
    const byId = new Map(results[i].map((r) => [String(r.id), r.ownerId ?? null]));
    for (const ref of g.refs) {
      out.set(artifactRefKey(ref.kind, ref.id), byId.get(ref.id) ?? null);
    }
  });
  return out;
}

/** Single-ref owner lookup (the analytics read gate). */
export async function lookupArtifactOwner(kind: ArtifactKind, artifactId: string): Promise<string | null> {
  const owners = await lookupArtifactOwners([{ kind, id: artifactId }]);
  return owners.get(artifactRefKey(kind, artifactId)) ?? null;
}
