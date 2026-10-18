/**
 * Voice-clone aggregate persistence — `studio_voice_clones` listings and the
 * `studio_voice_clone_licenses` ledger that grants synthesis rights. The use
 * cases (services/studio/voice-clones.ts) own access + paywall rules; this
 * module owns the SQL. Batch license helpers for cart checkout live in
 * studioFeaturesRepository.ts.
 */
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioVoiceClones, studioVoiceCloneLicenses } = schema;

export type VoiceCloneRow = typeof studioVoiceClones.$inferSelect;
export type VoiceCloneLicenseRow = typeof studioVoiceCloneLicenses.$inferSelect;

export interface VoiceCloneMarketplaceFilter {
  search?: string;
  language?: string;
  gender?: string;
  /** popular (default) | newest | price_asc | price_desc */
  sort: string;
  page: number;
  limit: number;
}

/** SAFE public projection — sampleAudioUrl / sampleAudioKey are omitted
 *  (buyers receive them only after licensing). */
const PUBLIC_LISTING_COLUMNS = {
  id: studioVoiceClones.id,
  name: studioVoiceClones.name,
  description: studioVoiceClones.description,
  previewAudioUrl: studioVoiceClones.previewAudioUrl,
  priceCents: studioVoiceClones.priceCents,
  currency: studioVoiceClones.currency,
  language: studioVoiceClones.language,
  gender: studioVoiceClones.gender,
  accent: studioVoiceClones.accent,
  listingSlug: studioVoiceClones.listingSlug,
  playCount: studioVoiceClones.playCount,
  purchaseCount: studioVoiceClones.purchaseCount,
  createdAt: studioVoiceClones.createdAt,
  creatorId: studioVoiceClones.userId,
};

export async function findVoiceCloneById(db: Db, id: string): Promise<VoiceCloneRow | null> {
  const [row] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, id)).limit(1);
  return row ?? null;
}

/** Every clone `userId` owns, newest first. */
export async function listVoiceClonesOwnedBy(db: Db, userId: string): Promise<VoiceCloneRow[]> {
  return db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.userId, userId))
    .orderBy(desc(studioVoiceClones.createdAt));
}

/** Every clone `userId` holds a license for (owned clones carry a self-license),
 *  most recently granted first. */
export async function listLicensedVoiceClones(
  db: Db,
  userId: string,
): Promise<Array<{ clone: VoiceCloneRow; license: VoiceCloneLicenseRow }>> {
  return db
    .select({ clone: studioVoiceClones, license: studioVoiceCloneLicenses })
    .from(studioVoiceCloneLicenses)
    .innerJoin(studioVoiceClones, eq(studioVoiceClones.id, studioVoiceCloneLicenses.voiceCloneId))
    .where(eq(studioVoiceCloneLicenses.userId, userId))
    .orderBy(desc(studioVoiceCloneLicenses.grantedAt));
}

/** True iff `userId` holds a license for `cloneId`. */
export async function hasVoiceCloneLicense(db: Db, userId: string, cloneId: string): Promise<boolean> {
  const rows = await db
    .select({ id: studioVoiceCloneLicenses.id })
    .from(studioVoiceCloneLicenses)
    .where(and(eq(studioVoiceCloneLicenses.userId, userId), eq(studioVoiceCloneLicenses.voiceCloneId, cloneId)))
    .limit(1);
  return rows.length > 0;
}

/** One page of the public marketplace catalog plus the unfiltered total. */
export async function findMarketplaceVoiceClones(db: Db, f: VoiceCloneMarketplaceFilter) {
  const conds: SQL[] = [eq(studioVoiceClones.visibility, "public")];
  if (f.search) {
    conds.push(sql`(${studioVoiceClones.name} ILIKE ${"%" + f.search + "%"} OR ${studioVoiceClones.description} ILIKE ${"%" + f.search + "%"})`);
  }
  if (f.language) conds.push(eq(studioVoiceClones.language, f.language));
  if (f.gender) conds.push(eq(studioVoiceClones.gender, f.gender));

  const order =
    f.sort === "newest"      ? desc(studioVoiceClones.createdAt)
    : f.sort === "price_asc" ? sql`${studioVoiceClones.priceCents} ASC`
    : f.sort === "price_desc"? sql`${studioVoiceClones.priceCents} DESC`
                              : desc(studioVoiceClones.purchaseCount);

  const where = and(...conds);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studioVoiceClones)
    .where(where);
  const total = countRow?.n ?? 0;

  const rows = await db
    .select(PUBLIC_LISTING_COLUMNS)
    .from(studioVoiceClones)
    .where(where)
    .orderBy(order)
    .limit(f.limit)
    .offset((f.page - 1) * f.limit);

  return { rows, total };
}

/** Every public clone authored by `userId`, newest first (SAFE projection + fee). */
export async function listPublicVoiceClonesByCreator(db: Db, userId: string) {
  return db
    .select({ ...PUBLIC_LISTING_COLUMNS, platformFeeBps: studioVoiceClones.platformFeeBps })
    .from(studioVoiceClones)
    .where(and(eq(studioVoiceClones.userId, userId), eq(studioVoiceClones.visibility, "public")))
    .orderBy(desc(studioVoiceClones.createdAt));
}

// ── Writes (services/studio/voice-clone-commands.ts) ─────────────────────────

export type VoiceCloneInsert = typeof studioVoiceClones.$inferInsert;
export type VoiceCloneLicenseInsert = typeof studioVoiceCloneLicenses.$inferInsert;

export async function insertVoiceClone(db: Db, values: VoiceCloneInsert): Promise<VoiceCloneRow> {
  const [row] = await db.insert(studioVoiceClones).values(values).returning();
  return row;
}

/** Idempotent on (user_id, voice_clone_id). */
export async function insertVoiceCloneLicense(db: Db, values: VoiceCloneLicenseInsert): Promise<void> {
  await db.insert(studioVoiceCloneLicenses).values(values).onConflictDoNothing();
}

export async function findOwnedVoiceClone(db: Db, id: string, userId: string): Promise<VoiceCloneRow | null> {
  const [row] = await db.select().from(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findVoiceClonesByIds(db: Db, ids: string[]): Promise<VoiceCloneRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(studioVoiceClones).where(inArray(studioVoiceClones.id, ids));
}

/** Owner-scoped update (userId in the WHERE is defense-in-depth). */
export async function updateOwnedVoiceClone(
  db: Db,
  id: string,
  userId: string,
  patch: Partial<VoiceCloneInsert>,
): Promise<VoiceCloneRow | null> {
  const [row] = await db.update(studioVoiceClones)
    .set(patch)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, userId)))
    .returning();
  return row ?? null;
}

export async function incrementVoiceClonePlayCount(db: Db, id: string): Promise<void> {
  await db.update(studioVoiceClones)
    .set({ playCount: sql`${studioVoiceClones.playCount} + 1` })
    .where(eq(studioVoiceClones.id, id));
}

export async function incrementVoiceClonePurchaseCount(db: Db, id: string): Promise<void> {
  await db.update(studioVoiceClones)
    .set({ purchaseCount: sql`${studioVoiceClones.purchaseCount} + 1` })
    .where(eq(studioVoiceClones.id, id));
}

/** Owner-scoped delete; returns the deleted row (for R2 cleanup) or null. */
export async function deleteOwnedVoiceClone(db: Db, id: string, userId: string): Promise<VoiceCloneRow | null> {
  const [row] = await db.delete(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteVoiceCloneLicensesFor(db: Db, voiceCloneId: string): Promise<void> {
  await db.delete(studioVoiceCloneLicenses).where(eq(studioVoiceCloneLicenses.voiceCloneId, voiceCloneId));
}
