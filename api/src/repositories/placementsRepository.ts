/**
 * PlacementsRepository — the recruiter placement aggregate (`placements`)
 * and its commission split rows (`placement_splits`, #228). Owner-scoped
 * on `placements.recruiter_id` unless documented otherwise.
 *
 * Inserts / patches accept a loose record: fee + salary columns are
 * numeric in Postgres but computed as numbers by the fee resolver.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { placements, placementSplits, users } = schema;

export type PlacementRow = typeof placements.$inferSelect;
export type PlacementInsert = typeof placements.$inferInsert;

export interface PlacementSplitView {
  id: string;
  placementId: string;
  ownerUserId: string;
  ownerType: string;
  percentBps: number;
  ownerName: string | null;
}

/** Display name of a user ("" fallback is the caller's concern). */
export async function findUserName(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ? row.name : null;
}

export async function insertPlacement(values: Record<string, unknown>): Promise<PlacementRow> {
  const [row] = await getDb().insert(placements).values(values as PlacementInsert).returning();
  return row;
}

export async function insertPlacements(values: Array<Record<string, unknown>>): Promise<PlacementRow[]> {
  return getDb().insert(placements).values(values as PlacementInsert[]).returning();
}

export async function updateOwnedPlacement(
  recruiterId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<PlacementRow | null> {
  const [updated] = await getDb()
    .update(placements)
    .set(patch as Partial<PlacementInsert>)
    .where(and(eq(placements.id, id), eq(placements.recruiterId, recruiterId)))
    .returning();
  return updated ?? null;
}

export async function listPlacementsForRecruiter(recruiterId: string): Promise<PlacementRow[]> {
  return getDb()
    .select()
    .from(placements)
    .where(eq(placements.recruiterId, recruiterId))
    .orderBy(desc(placements.createdAt));
}

export async function findOwnedPlacement(recruiterId: string, id: string): Promise<PlacementRow | null> {
  const [row] = await getDb()
    .select()
    .from(placements)
    .where(and(eq(placements.id, id), eq(placements.recruiterId, recruiterId)))
    .limit(1);
  return row ?? null;
}

/** Owner-guard: does the caller own this placement? */
export async function ownsPlacement(recruiterId: string, id: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: placements.id })
    .from(placements)
    .where(and(eq(placements.id, id), eq(placements.recruiterId, recruiterId)))
    .limit(1);
  return Boolean(row);
}

// ── Commission summary reads ────────────────────────────────────────────────

export interface OwnedPlacementCommissionRow {
  id: string;
  recruiterId: string;
  commissionAmount: string;
  commissionStatus: string;
  createdAt: Date;
}

export async function listOwnedCommissionRows(recruiterId: string): Promise<OwnedPlacementCommissionRow[]> {
  return getDb()
    .select({
      id: placements.id,
      recruiterId: placements.recruiterId,
      commissionAmount: placements.commissionAmount,
      commissionStatus: placements.commissionStatus,
      createdAt: placements.createdAt,
    })
    .from(placements)
    .where(eq(placements.recruiterId, recruiterId));
}

export interface SplitPlacementCommissionRow {
  id: string;
  recruiterId: string;
  commissionAmount: string;
  commissionStatus: string;
  percentBps: number;
  ownerUserId: string;
}

/** Every placement the user is a split owner on (owned or not), with its fee. */
export async function listSplitCommissionRowsForOwner(ownerUserId: string): Promise<SplitPlacementCommissionRow[]> {
  return getDb()
    .select({
      id: placements.id,
      recruiterId: placements.recruiterId,
      commissionAmount: placements.commissionAmount,
      commissionStatus: placements.commissionStatus,
      percentBps: placementSplits.percentBps,
      ownerUserId: placementSplits.ownerUserId,
    })
    .from(placementSplits)
    .innerJoin(placements, eq(placementSplits.placementId, placements.id))
    .where(eq(placementSplits.ownerUserId, ownerUserId));
}

/** Which of `placementIds` have ANY split rows. */
export async function findPlacementIdsWithSplits(placementIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (placementIds.length === 0) return out;
  const flagged = await getDb()
    .selectDistinct({ placementId: placementSplits.placementId })
    .from(placementSplits)
    .where(inArray(placementSplits.placementId, placementIds));
  for (const r of flagged) out.add(r.placementId);
  return out;
}

// ── Splits ──────────────────────────────────────────────────────────────────

export async function listSplitsForPlacement(placementId: string): Promise<PlacementSplitView[]> {
  return getDb()
    .select({
      id: placementSplits.id,
      placementId: placementSplits.placementId,
      ownerUserId: placementSplits.ownerUserId,
      ownerType: placementSplits.ownerType,
      percentBps: placementSplits.percentBps,
      ownerName: users.name,
    })
    .from(placementSplits)
    .leftJoin(users, eq(placementSplits.ownerUserId, users.id))
    .where(eq(placementSplits.placementId, placementId))
    .orderBy(desc(placementSplits.percentBps));
}

/** Replace-all: clear then re-insert so the set is exactly what was sent. */
export async function replaceSplits(
  placementId: string,
  splits: Array<{ ownerUserId: string; ownerType: string; percentBps: number }>,
): Promise<void> {
  const db = getDb();
  await db.delete(placementSplits).where(eq(placementSplits.placementId, placementId));
  if (splits.length > 0) {
    await db.insert(placementSplits).values(
      splits.map((s) => ({ placementId, ownerUserId: s.ownerUserId, ownerType: s.ownerType, percentBps: s.percentBps })),
    );
  }
}
