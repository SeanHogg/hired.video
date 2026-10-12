/**
 * LegalRepository — versioned legal documents + per-user acceptances.
 *
 * Batch-shaped reads so callers (GET /legal/me/status, the creator
 * program-terms gate) resolve N document kinds in a fixed number of
 * queries instead of one acceptance lookup per kind.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { legalDocuments, legalDocumentAcceptances } = schema;

export type DbLike = any;

export type LegalDocumentRow = typeof legalDocuments.$inferSelect;
export type LegalAcceptanceInsert = typeof legalDocumentAcceptances.$inferInsert;

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
        console.warn(`[${logTag}] legal-doc acceptance failed:`, batchErr);
        return;
      }
    }
    for (const row of rows) {
      try {
        await this.db.insert(legalDocumentAcceptances).values(row);
      } catch (e) {
        console.warn(`[${logTag}] legal-doc acceptance failed:`, e);
      }
    }
  }
}
