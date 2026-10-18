/**
 * Photorealistic talking-head render jobs (#1560) — the
 * `photoreal_avatar_renders` table, scoped to the owning user.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { photorealAvatarRenders } = schema;

export type PhotorealAvatarRenderRow = typeof photorealAvatarRenders.$inferSelect;
export type PhotorealAvatarRenderInsert = typeof photorealAvatarRenders.$inferInsert;

export async function insertPhotorealAvatarRender(
  db: Db,
  values: PhotorealAvatarRenderInsert,
): Promise<PhotorealAvatarRenderRow> {
  const [row] = await db.insert(photorealAvatarRenders).values(values).returning();
  return row;
}

/** The owner's renders, newest first. */
export async function listPhotorealAvatarRendersByOwner(
  db: Db,
  ownerUserId: string,
  limit: number,
): Promise<PhotorealAvatarRenderRow[]> {
  return db.select().from(photorealAvatarRenders)
    .where(eq(photorealAvatarRenders.ownerUserId, ownerUserId))
    .orderBy(desc(photorealAvatarRenders.createdAt))
    .limit(limit);
}

export async function findOwnedPhotorealAvatarRender(
  db: Db,
  id: string,
  ownerUserId: string,
): Promise<PhotorealAvatarRenderRow | null> {
  const [row] = await db.select().from(photorealAvatarRenders)
    .where(and(eq(photorealAvatarRenders.id, id), eq(photorealAvatarRenders.ownerUserId, ownerUserId)))
    .limit(1);
  return row ?? null;
}
