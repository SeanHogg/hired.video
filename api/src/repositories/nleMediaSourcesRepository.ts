/**
 * NLE media-source persistence — the `nle_media_sources` aggregate and its
 * `nle_media_tags` children (db/schema/nle.ts). The NLE source use cases
 * (services/nle/nle-sources.ts) own the rules (auth, dedupe, R2); this
 * module owns the SQL. Split out of routes/nle.ts.
 */
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { buildOwnershipFilter } from "../services/studio/workspace.js";
import type { OwnershipScope } from "./studioProjectsRepository.js";

const { nleMediaSources, nleMediaTags } = schema;

export type NleMediaSourceRow = typeof nleMediaSources.$inferSelect;
export type NleMediaSourceInsert = typeof nleMediaSources.$inferInsert;
export type NleMediaSourcePatch = Partial<Pick<NleMediaSourceInsert, "binFolder" | "url" | "filename" | "proxyUrl">>;
export type NleMediaSourceWithTags = NleMediaSourceRow & { tags: string[] };

/** The sources the scope's actor can read (own / company / delegated). */
const ownedBy = (scope: OwnershipScope) =>
  buildOwnershipFilter({ userIdColumn: nleMediaSources.userId, companyIdColumn: nleMediaSources.companyId, ...scope });

export async function findSourceById(db: Db, id: string): Promise<NleMediaSourceRow | null> {
  const [row] = await db.select().from(nleMediaSources).where(eq(nleMediaSources.id, id)).limit(1);
  return row ?? null;
}

/** One source plus its tag list (two reads, as the routes always did). */
export async function findSourceWithTags(db: Db, id: string): Promise<NleMediaSourceWithTags | null> {
  const row = await findSourceById(db, id);
  const tagRows = await db
    .select({ tag: nleMediaTags.tag })
    .from(nleMediaTags)
    .where(eq(nleMediaTags.sourceId, id));
  if (!row) return null;
  return { ...row, tags: tagRows.map((t) => t.tag) };
}

/**
 * The 500 newest sources the caller can see, each enriched with its tags.
 * Tags load in ONE round-trip (N+1 is the failure mode this avoids); an
 * empty source list short-circuits the IN(...) which Postgres rejects.
 */
export async function listSourcesWithTags(db: Db, scope: OwnershipScope): Promise<NleMediaSourceWithTags[]> {
  const rows = await db
    .select()
    .from(nleMediaSources)
    .where(ownedBy(scope))
    .orderBy(desc(nleMediaSources.uploadedAt))
    .limit(500);
  const tagRows = rows.length
    ? await db
        .select()
        .from(nleMediaTags)
        .where(inArray(nleMediaTags.sourceId, rows.map((r) => r.id)))
    : [];
  const tagsBySource = new Map<string, string[]>();
  for (const t of tagRows) {
    const arr = tagsBySource.get(t.sourceId);
    if (arr) arr.push(t.tag);
    else tagsBySource.set(t.sourceId, [t.tag]);
  }
  return rows.map((r) => ({ ...r, tags: tagsBySource.get(r.id) ?? [] }));
}

/** Distinct tags across every source the caller can see, alphabetical. */
export async function listDistinctTags(db: Db, scope: OwnershipScope): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tag: nleMediaTags.tag })
    .from(nleMediaTags)
    .innerJoin(nleMediaSources, eq(nleMediaTags.sourceId, nleMediaSources.id))
    .where(ownedBy(scope))
    .orderBy(nleMediaTags.tag);
  return rows.map((r) => r.tag);
}

/**
 * Rename a bin folder (and every folder nested under it) across the rows
 * the caller can see, in ONE statement. `from` matches exactly or as a
 * `from/...` prefix: equality uses idx_nle_media_sources_bin_folder, the
 * LIKE 'prefix/%' branch uses idx_nle_media_sources_bin_folder_text_pattern
 * (#1804). The new path is computed per row with a CASE; an empty `to`
 * rewrites exact matches to NULL (root) and descendants to the remainder.
 * Inputs must already be normalised (no leading/trailing/double slashes).
 */
export async function renameBinFolder(
  db: Db,
  scope: OwnershipScope,
  from: string,
  to: string,
): Promise<number> {
  const folderMatch = or(eq(nleMediaSources.binFolder, from), like(nleMediaSources.binFolder, `${from}/%`));
  const replacement = to
    ? sql`CASE
        WHEN ${nleMediaSources.binFolder} = ${from}
          THEN ${to}
        ELSE ${to} || SUBSTRING(${nleMediaSources.binFolder} FROM ${from.length + 1})
      END`
    : sql`CASE
        WHEN ${nleMediaSources.binFolder} = ${from}
          THEN NULL
        ELSE SUBSTRING(${nleMediaSources.binFolder} FROM ${from.length + 2})
      END`;
  const updated = await db
    .update(nleMediaSources)
    .set({ binFolder: replacement })
    .where(and(ownedBy(scope), folderMatch))
    .returning({ id: nleMediaSources.id });
  return updated.length;
}

export async function updateSource(db: Db, id: string, patch: NleMediaSourcePatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db.update(nleMediaSources).set(patch).where(eq(nleMediaSources.id, id));
}

/** Replace a source's whole tag set (delete, then insert the new list). */
export async function replaceSourceTags(db: Db, id: string, tags: string[]): Promise<void> {
  await db.delete(nleMediaTags).where(eq(nleMediaTags.sourceId, id));
  if (tags.length > 0) {
    await db.insert(nleMediaTags).values(tags.map((tag) => ({ sourceId: id, tag })));
  }
}

/** The dedupe hit for one workspace: same owner user, same company (NULL =
 *  personal) and same content hash — the idx_nle_media_sources_dedup key. */
export async function findSourceByContentHash(
  db: Db,
  ownerUserId: string,
  ownerCompanyId: string | null,
  contentHash: string,
): Promise<NleMediaSourceRow | null> {
  const [row] = await db
    .select()
    .from(nleMediaSources)
    .where(
      and(
        eq(nleMediaSources.userId, ownerUserId),
        ownerCompanyId ? eq(nleMediaSources.companyId, ownerCompanyId) : isNull(nleMediaSources.companyId),
        eq(nleMediaSources.contentHash, contentHash),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertSource(db: Db, values: NleMediaSourceInsert): Promise<NleMediaSourceRow> {
  const [inserted] = await db.insert(nleMediaSources).values(values).returning();
  return inserted;
}

export async function deleteSource(db: Db, id: string): Promise<void> {
  await db.delete(nleMediaSources).where(eq(nleMediaSources.id, id));
}
