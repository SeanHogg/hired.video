/**
 * AutofillRepository — the user's Q&A answer cache + submitted form
 * answers. Its own aggregate (separate from Users) because writes
 * happen on independent endpoints (POST /autofill/generate + /save)
 * with their own concurrency + TTL semantics — not every user update
 * touches the cache.
 */

import { desc, eq, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { answerCache, applicationFormAnswers } = schema;

export type DbLike = any;

export type AnswerCacheRow = typeof answerCache.$inferSelect;
export type AnswerCacheInsert = typeof answerCache.$inferInsert;
export type ApplicationFormAnswerRow = typeof applicationFormAnswers.$inferSelect;
export type ApplicationFormAnswerInsert = typeof applicationFormAnswers.$inferInsert;

export interface GeneratedAnswerEntry {
  questionHash: string;
  questionText: string;
  questionCategory: string | null;
  answer: string;
}

export interface IAutofillRepository {
  findCachedAnswersForUser(userId: string): Promise<AnswerCacheRow[]>;
  upsertCachedAnswer(input: AnswerCacheInsert): Promise<void>;
  /**
   * Record freshly generated answers in ONE multi-row upsert: new questions
   * are inserted, existing ones get the new answer + `timesUsed + 1`.
   * Duplicate hashes in `entries` are collapsed (last wins) — Postgres
   * rejects a multi-row ON CONFLICT touching the same row twice.
   */
  recordGeneratedAnswers(userId: string, entries: GeneratedAnswerEntry[]): Promise<void>;
  findFormAnswersForUser(userId: string): Promise<ApplicationFormAnswerRow[]>;
  insertFormAnswer(input: ApplicationFormAnswerInsert): Promise<ApplicationFormAnswerRow>;
}

export class AutofillRepository implements IAutofillRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findCachedAnswersForUser(userId: string): Promise<AnswerCacheRow[]> {
    return (await this.db
      .select()
      .from(answerCache)
      .where(eq(answerCache.userId, userId))) as AnswerCacheRow[];
  }

  async upsertCachedAnswer(input: AnswerCacheInsert): Promise<void> {
    await this.db
      .insert(answerCache)
      .values({ ...(input as any), updatedAt: this.now() })
      .onConflictDoUpdate({
        target: [answerCache.userId, answerCache.questionHash],
        set: { ...(input as any), updatedAt: this.now() },
      });
  }

  async recordGeneratedAnswers(userId: string, entries: GeneratedAnswerEntry[]): Promise<void> {
    const byHash = new Map<string, GeneratedAnswerEntry>();
    for (const e of entries) byHash.set(e.questionHash, e);
    if (byHash.size === 0) return;
    const now = this.now();
    await this.db
      .insert(answerCache)
      .values(
        [...byHash.values()].map((e) => ({
          userId,
          questionHash: e.questionHash,
          questionText: e.questionText,
          questionCategory: e.questionCategory,
          answer: e.answer,
        })),
      )
      .onConflictDoUpdate({
        target: [answerCache.userId, answerCache.questionHash],
        set: {
          answer: sql`excluded.answer`,
          timesUsed: sql`${answerCache.timesUsed} + 1`,
          lastUsedAt: now,
          updatedAt: now,
        },
      });
  }

  async findFormAnswersForUser(userId: string): Promise<ApplicationFormAnswerRow[]> {
    return (await this.db
      .select()
      .from(applicationFormAnswers)
      .where(eq(applicationFormAnswers.userId, userId))
      .orderBy(desc(applicationFormAnswers.createdAt))) as ApplicationFormAnswerRow[];
  }

  async insertFormAnswer(input: ApplicationFormAnswerInsert): Promise<ApplicationFormAnswerRow> {
    const [row] = await this.db.insert(applicationFormAnswers).values(input as any).returning();
    return row as ApplicationFormAnswerRow;
  }
}
