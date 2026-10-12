/**
 * RenderVariantRepository — `studio_project_render_variants` (migration 0522,
 * #2045): the fitted cuts of a Studio project's master render. The only
 * module that touches the table.
 *
 * Dedupe lives in the schema: the unique index on (project, variant key,
 * content revision) admits one cut per content revision, so `insert` is
 * insert-or-nothing and a racing second writer learns it lost (null).
 *
 * Imports its table straight from the schema file so it works before the
 * coordinator adds the table to `db/schema/index.ts`.
 */
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { studioProjectRenderVariants as variants } from "../db/schema/renderVariants.js";
import { videos } from "../db/schema/videos.js";

export type DbLike = any;

/**
 * THE predicate that keeps fitted cuts out of every user- and admin-facing
 * count or list of videos: a cut is a delivery file behind one post, never
 * a video in its own right. Pass the `videos.id` column of the query.
 * Served by the unique index on `video_id`.
 */
export function isNotRenderVariant(videoId: AnyPgColumn): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM ${variants} WHERE ${variants.videoId} = ${videoId})`;
}

/** A cut and the file behind it. */
export interface RenderVariant {
  id: string;
  projectId: string;
  variantKey: string;
  contentRevision: string;
  videoId: string;
  r2Key: string | null;
  branded: boolean;
}

export interface VariantIdentity {
  projectId: string;
  variantKey: string;
  contentRevision: string;
}

const COLUMNS = {
  id: variants.id,
  projectId: variants.projectId,
  variantKey: variants.variantKey,
  contentRevision: variants.contentRevision,
  videoId: variants.videoId,
  r2Key: videos.r2Key,
  branded: videos.branded,
};

/** The cut for this project, key and content revision, or null. */
export async function findVariant(db: DbLike, id: VariantIdentity): Promise<RenderVariant | null> {
  const [row] = await db
    .select(COLUMNS)
    .from(variants)
    .innerJoin(videos, eq(videos.id, variants.videoId))
    .where(
      and(
        eq(variants.projectId, id.projectId),
        eq(variants.variantKey, id.variantKey),
        eq(variants.contentRevision, id.contentRevision),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The cut whose file is `videoId` — only when it is a cut of `projectId`. */
export async function findVariantByVideo(
  db: DbLike,
  args: { projectId: string; videoId: string },
): Promise<RenderVariant | null> {
  const [row] = await db
    .select(COLUMNS)
    .from(variants)
    .innerJoin(videos, eq(videos.id, variants.videoId))
    .where(and(eq(variants.videoId, args.videoId), eq(variants.projectId, args.projectId)))
    .limit(1);
  return row ?? null;
}

/** By id (a promotion submission's stored cut). */
export async function findVariantById(db: DbLike, variantId: string): Promise<RenderVariant | null> {
  const [row] = await db
    .select(COLUMNS)
    .from(variants)
    .innerJoin(videos, eq(videos.id, variants.videoId))
    .where(eq(variants.id, variantId))
    .limit(1);
  return row ?? null;
}

/** Record a cut. Null when one already exists for this identity (dedupe). */
export async function insertVariant(
  db: DbLike,
  row: VariantIdentity & { videoId: string },
): Promise<{ id: string } | null> {
  const [created] = await db
    .insert(variants)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: variants.id });
  return created ?? null;
}

/** This key's cuts of earlier content revisions — superseded once a new one lands. */
export async function listSupersededVariants(
  db: DbLike,
  keep: VariantIdentity,
): Promise<Array<{ videoId: string; r2Key: string | null; contentRevision: string }>> {
  return db
    .select({ videoId: variants.videoId, r2Key: videos.r2Key, contentRevision: variants.contentRevision })
    .from(variants)
    .innerJoin(videos, eq(videos.id, variants.videoId))
    .where(
      and(
        eq(variants.projectId, keep.projectId),
        eq(variants.variantKey, keep.variantKey),
        ne(variants.contentRevision, keep.contentRevision),
      ),
    )
    .limit(20);
}
