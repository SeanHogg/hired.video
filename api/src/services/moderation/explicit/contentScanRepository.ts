/**
 * content_scans repository (migration 0505) — the ONE reader/writer of the
 * table. Rows are explicit-scan verdicts keyed by (subject_type, subject_id);
 * see api/src/db/schema/contentScans.ts for what each subject type means.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "../../../db/index.js";
import { contentScans, type ContentScanRow } from "../../../db/schema/contentScans.js";
import {
  isScanVerdict,
  normalizeCategories,
  type ExplicitCategory,
  type ExplicitVerdict,
  type ScanOverride,
  type ScanSubjectKind,
  type ScanVerdict,
} from "../../../../../shared/moderation/explicit.js";

export interface StoredScan {
  subjectType: ScanSubjectKind;
  subjectId: string;
  ownerUserId: string | null;
  verdict: ScanVerdict;
  categories: ExplicitCategory[];
  reason: string | null;
  inputHash: string | null;
  overrideVerdict: ScanOverride | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  scannedAt: Date;
}

function toStored(row: ContentScanRow): StoredScan {
  return {
    subjectType: row.subjectType as ScanSubjectKind,
    subjectId: row.subjectId,
    ownerUserId: row.ownerUserId,
    verdict: isScanVerdict(row.verdict) ? row.verdict : "unscreened",
    categories: normalizeCategories(row.categories ?? []),
    reason: row.reason,
    inputHash: row.inputHash,
    overrideVerdict: row.overrideVerdict === "pass" || row.overrideVerdict === "block" ? row.overrideVerdict : null,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    scannedAt: row.scannedAt,
  };
}

export async function getScan(subjectType: ScanSubjectKind, subjectId: string, db: Db = getDb()): Promise<StoredScan | null> {
  const [row] = await db
    .select()
    .from(contentScans)
    .where(and(eq(contentScans.subjectType, subjectType), eq(contentScans.subjectId, subjectId)))
    .limit(1);
  return row ? toStored(row) : null;
}

export async function getScans(subjectType: ScanSubjectKind, subjectIds: readonly string[], db: Db = getDb()): Promise<Map<string, StoredScan>> {
  if (subjectIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(contentScans)
    .where(and(eq(contentScans.subjectType, subjectType), inArray(contentScans.subjectId, [...subjectIds])));
  return new Map(rows.map((r) => [r.subjectId, toStored(r)]));
}

/** A final (pass / block) verdict already computed for the same bytes. */
export async function findFinalByInputHash(subjectType: ScanSubjectKind, inputHash: string, db: Db = getDb()): Promise<StoredScan | null> {
  const [row] = await db
    .select()
    .from(contentScans)
    .where(and(
      eq(contentScans.subjectType, subjectType),
      eq(contentScans.inputHash, inputHash),
      inArray(contentScans.verdict, ["pass", "block"]),
    ))
    .orderBy(desc(contentScans.scannedAt))
    .limit(1);
  return row ? toStored(row) : null;
}

/**
 * Write a scan verdict. A SuperAdmin override survives a rescan of the SAME
 * input (same hash) and is cleared when the content changed.
 */
export async function upsertScan(
  args: {
    subjectType: ScanSubjectKind;
    subjectId: string;
    ownerUserId: string | null;
    verdict: ExplicitVerdict;
    inputHash: string | null;
  },
  db: Db = getDb(),
): Promise<StoredScan> {
  const values = {
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    ownerUserId: args.ownerUserId,
    verdict: args.verdict.verdict,
    categories: args.verdict.categories,
    reason: args.verdict.reason,
    inputHash: args.inputHash,
    scannedAt: new Date(),
  };
  const changed = sql`${contentScans.inputHash} IS DISTINCT FROM ${args.inputHash}`;
  const [row] = await db
    .insert(contentScans)
    .values(values)
    .onConflictDoUpdate({
      target: [contentScans.subjectType, contentScans.subjectId],
      set: {
        ownerUserId: values.ownerUserId,
        verdict: values.verdict,
        categories: values.categories,
        reason: values.reason,
        scannedAt: values.scannedAt,
        overrideVerdict: sql`CASE WHEN ${changed} THEN NULL ELSE ${contentScans.overrideVerdict} END`,
        reviewedBy: sql`CASE WHEN ${changed} THEN NULL ELSE ${contentScans.reviewedBy} END`,
        reviewedAt: sql`CASE WHEN ${changed} THEN NULL ELSE ${contentScans.reviewedAt} END`,
        inputHash: values.inputHash,
      },
    })
    .returning();
  return toStored(row);
}

/** Mark a scan as re-checked now without changing its verdict (content was
 *  re-read and found unchanged). */
export async function touchScan(subjectType: ScanSubjectKind, subjectId: string, db: Db = getDb()): Promise<void> {
  await db
    .update(contentScans)
    .set({ scannedAt: new Date() })
    .where(and(eq(contentScans.subjectType, subjectType), eq(contentScans.subjectId, subjectId)));
}

/** Re-key a scan to the content hash it now stands for WITHOUT clearing its
 *  override (used once per legacy-approved video, migration 0509). */
export async function adoptInputHash(subjectType: ScanSubjectKind, subjectId: string, inputHash: string, db: Db = getDb()): Promise<void> {
  await db
    .update(contentScans)
    .set({ inputHash, scannedAt: new Date() })
    .where(and(eq(contentScans.subjectType, subjectType), eq(contentScans.subjectId, subjectId)));
}

export async function setOverride(
  args: { subjectType: ScanSubjectKind; subjectId: string; override: ScanOverride; reviewerId: string },
  db: Db = getDb(),
): Promise<StoredScan | null> {
  const [row] = await db
    .update(contentScans)
    .set({ overrideVerdict: args.override, reviewedBy: args.reviewerId, reviewedAt: new Date() })
    .where(and(eq(contentScans.subjectType, args.subjectType), eq(contentScans.subjectId, args.subjectId)))
    .returning();
  return row ? toStored(row) : null;
}

export type ReviewFilter = "needs_review" | "approved";

/** Video scans for the SuperAdmin queue, newest first. `needs_review` =
 *  effectively not passing; `approved` = SuperAdmin-approved overrides. */
export async function listVideoScansForReview(filter: ReviewFilter, limit: number, db: Db = getDb()): Promise<StoredScan[]> {
  const effective = sql`coalesce(${contentScans.overrideVerdict}, ${contentScans.verdict})`;
  const where = filter === "approved"
    ? and(eq(contentScans.subjectType, "video"), eq(contentScans.overrideVerdict, "pass"))
    : and(eq(contentScans.subjectType, "video"), sql`${effective} <> 'pass'`);
  const rows = await db
    .select()
    .from(contentScans)
    .where(where)
    .orderBy(desc(contentScans.scannedAt))
    .limit(limit);
  return rows.map(toStored);
}
