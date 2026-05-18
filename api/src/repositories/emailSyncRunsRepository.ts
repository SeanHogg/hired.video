/**
 * EmailSyncRunsRepository — per-account sync run audit + digest source.
 *
 * Read-only today: the PWA-driven ingest path (`services/email-integration/ingest.ts`)
 * doesn't write to `email_sync_runs` since the #757 cutover, so this repo
 * only exposes the listing surface that the Email Settings / Inbox sync-history
 * sheet renders. Re-introducing writes (one row per logical sync) is
 * tracked in gap-register #811.
 */

import { desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { emailSyncRuns } = schema;

export type DbLike = any;

type EmailSyncRunRow = typeof emailSyncRuns.$inferSelect;

export interface IEmailSyncRunsRepository {
  findRecentForUser(userId: string, limit?: number): Promise<EmailSyncRunRow[]>;
}

export class EmailSyncRunsRepository implements IEmailSyncRunsRepository {
  constructor(private readonly db: DbLike) {}

  async findRecentForUser(userId: string, limit = 10): Promise<EmailSyncRunRow[]> {
    return (await this.db
      .select()
      .from(emailSyncRuns)
      .where(eq(emailSyncRuns.userId, userId))
      .orderBy(desc(emailSyncRuns.startedAt))
      .limit(Math.min(50, Math.max(1, limit)))) as EmailSyncRunRow[];
  }
}
