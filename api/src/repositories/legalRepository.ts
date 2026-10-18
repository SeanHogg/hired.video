/**
 * LegalRepository — versioned legal documents + per-user acceptances.
 *
 * Batch-shaped reads so callers (GET /legal/me/status, the creator
 * program-terms gate) resolve N document kinds in a fixed number of
 * queries instead of one acceptance lookup per kind.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";
import { logger } from "../lib/logger.js";

const { legalDocuments, legalDocumentAcceptances } = schema;

export type DbLike = any;

export type LegalDocumentRow = typeof legalDocuments.$inferSelect;
export type LegalAcceptanceInsert = typeof legalDocumentAcceptances.$inferInsert;
export type LegalAcceptanceRow = typeof legalDocumentAcceptances.$inferSelect;
export type LegalDocumentInsert = typeof legalDocuments.$inferInsert;

export interface LatestAcceptance {
  version: string;
  acceptedAt: Date | string | null;
}

export class LegalRepository {
  constructor(private readonly db: DbLike) {}

  /** Current published docs for a locale, optionally narrowed to `kinds`. */
  async findCurrentDocs(locale: string, kinds?: readonly string[]): Promise<LegalDocumentRow[]> {
    if (kinds && kinds.length === 0) return [];
    const conds = [eq(legalDocuments.locale, locale), eq(legalDocuments.isCurrent, true)];
    if (kinds) conds.push(inArray(legalDocuments.kind, [...kinds]));
    return (await this.db
      .select()
      .from(legalDocuments)
      .where(and(...conds))) as LegalDocumentRow[];
  }

  /**
   * The user's most recent acceptance per kind, for many kinds in ONE
   * query (DISTINCT ON (kind) … ORDER BY kind, accepted_at DESC). Keyed
   * by kind; kinds never accepted are absent.
   */
  async findLatestAcceptancesByKind(
    userId: string,
    kinds: readonly string[],
  ): Promise<Map<string, LatestAcceptance>> {
    const out = new Map<string, LatestAcceptance>();
    if (kinds.length === 0) return out;
    const rows = (await this.db
      .selectDistinctOn([legalDocumentAcceptances.kind], {
        kind: legalDocumentAcceptances.kind,
        version: legalDocumentAcceptances.version,
        acceptedAt: legalDocumentAcceptances.acceptedAt,
      })
      .from(legalDocumentAcceptances)
      .where(and(
        eq(legalDocumentAcceptances.userId, userId),
        inArray(legalDocumentAcceptances.kind, [...kinds]),
      ))
      .orderBy(legalDocumentAcceptances.kind, desc(legalDocumentAcceptances.acceptedAt))) as Array<{
      kind: string;
      version: string;
      acceptedAt: Date | string | null;
    }>;
    for (const r of rows) out.set(r.kind, { version: r.version, acceptedAt: r.acceptedAt });
    return out;
  }

  /**
   * Write many acceptance audit rows in ONE multi-row insert. Acceptance
   * rows are a soft audit trail (the calling flow's own row is the primary
   * record), so if the batch fails — e.g. one stale document id trips the
   * FK — fall back to per-row inserts so the valid docs are still recorded.
   * The fallback only runs on the error path.
   */
  async insertAcceptancesSoft(rows: readonly LegalAcceptanceInsert[], logTag: string): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.db.insert(legalDocumentAcceptances).values([...rows]);
      return;
    } catch (batchErr) {
      if (rows.length === 1) {
        logger.warn(`[${logTag}] legal-doc acceptance failed`, batchErr);
        return;
      }
    }
    for (const row of rows) {
      try {
        await this.db.insert(legalDocumentAcceptances).values(row);
      } catch (e) {
        logger.warn(`[${logTag}] legal-doc acceptance failed`, e);
      }
    }
  }

  /** The published (current) version of one kind in a locale. */
  async findCurrentDoc(kind: string, locale: string): Promise<LegalDocumentRow | null> {
    const [row] = await this.db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.kind, kind), eq(legalDocuments.locale, locale), eq(legalDocuments.isCurrent, true)))
      .limit(1);
    return (row as LegalDocumentRow) ?? null;
  }

  /** Every current doc in a locale, ordered by kind. */
  async listCurrentDocs(locale: string): Promise<LegalDocumentRow[]> {
    return (await this.db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.locale, locale), eq(legalDocuments.isCurrent, true)))
      .orderBy(legalDocuments.kind)) as LegalDocumentRow[];
  }

  async findDocById(id: string): Promise<LegalDocumentRow | null> {
    const [row] = await this.db.select().from(legalDocuments).where(eq(legalDocuments.id, id)).limit(1);
    return (row as LegalDocumentRow) ?? null;
  }

  /** Every version of every kind (SuperAdmin list). */
  async listAllDocs(): Promise<LegalDocumentRow[]> {
    return (await this.db
      .select()
      .from(legalDocuments)
      .orderBy(legalDocuments.kind, desc(legalDocuments.publishedAt), desc(legalDocuments.createdAt))) as LegalDocumentRow[];
  }

  async insertDoc(values: LegalDocumentInsert): Promise<LegalDocumentRow> {
    const [row] = await this.db.insert(legalDocuments).values(values).returning();
    return row as LegalDocumentRow;
  }

  async updateDoc(id: string, patch: Partial<LegalDocumentInsert>): Promise<LegalDocumentRow | null> {
    const [row] = await this.db.update(legalDocuments).set(patch).where(eq(legalDocuments.id, id)).returning();
    return (row as LegalDocumentRow) ?? null;
  }

  /** Make `doc` the current version: un-current the prior current doc of the
   *  same (kind, locale) FIRST — the partial unique index forbids overlap. */
  async publishDoc(doc: LegalDocumentRow, publisherId: string): Promise<LegalDocumentRow | null> {
    const now = new Date();
    await this.db
      .update(legalDocuments)
      .set({ isCurrent: false, updatedAt: now })
      .where(and(eq(legalDocuments.kind, doc.kind), eq(legalDocuments.locale, doc.locale), eq(legalDocuments.isCurrent, true)));
    return this.updateDoc(doc.id, { isCurrent: true, publishedAt: doc.publishedAt ?? now, publishedBy: publisherId, updatedAt: now });
  }

  async deleteDoc(id: string): Promise<void> {
    await this.db.delete(legalDocuments).where(eq(legalDocuments.id, id));
  }

  async insertAcceptance(values: LegalAcceptanceInsert): Promise<LegalAcceptanceRow> {
    const [row] = await this.db.insert(legalDocumentAcceptances).values(values).returning();
    return row as LegalAcceptanceRow;
  }

  /** The user's full acceptance history, newest first. */
  async listAcceptancesForUser(userId: string): Promise<LegalAcceptanceRow[]> {
    return (await this.db
      .select()
      .from(legalDocumentAcceptances)
      .where(eq(legalDocumentAcceptances.userId, userId))
      .orderBy(desc(legalDocumentAcceptances.acceptedAt))) as LegalAcceptanceRow[];
  }
}
