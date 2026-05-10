/**
 * EmailSyncRunsRepository — per-account sync run audit + digest source.
 *
 * Each cron-driven sync writes one row, mutating it as the run advances
 * (counts → status → digest summary on the P4 pass).
 */

import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { emailSyncRuns } = schema;

export type DbLike = any;

export type EmailSyncRunRow = typeof emailSyncRuns.$inferSelect;
export type EmailSyncRunInsert = typeof emailSyncRuns.$inferInsert;
export type EmailSyncRunPatch = Partial<EmailSyncRunInsert>;

export interface IEmailSyncRunsRepository {
  start(input: EmailSyncRunInsert): Promise<EmailSyncRunRow>;
  patch(id: string, patch: EmailSyncRunPatch): Promise<void>;
  findRecentForUser(userId: string, limit?: number): Promise<EmailSyncRunRow[]>;
}

export class EmailSyncRunsRepository implements IEmailSyncRunsRepository {
  constructor(private readonly db: DbLike) {}

  async start(input: EmailSyncRunInsert): Promise<EmailSyncRunRow> {
    const [row] = await this.db.insert(emailSyncRuns).values(input as any).returning();
    return row as EmailSyncRunRow;
  }

  async patch(id: string, patch: EmailSyncRunPatch): Promise<void> {
    await this.db.update(emailSyncRuns).set(patch as any).where(eq(emailSyncRuns.id, id));
  }

  async findRecentForUser(userId: string, limit = 10): Promise<EmailSyncRunRow[]> {
    return (await this.db
      .select()
      .from(emailSyncRuns)
      .where(eq(emailSyncRuns.userId, userId))
      .orderBy(desc(emailSyncRuns.startedAt))
      .limit(Math.min(50, Math.max(1, limit)))) as EmailSyncRunRow[];
  }
}
