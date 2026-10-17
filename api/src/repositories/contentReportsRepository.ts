/**
 * ContentReportsRepository — read side of user content-abuse reports (#152).
 * Writes (file / resolve) stay in services/moderation/moderationService.ts
 * because they fan out notifications + inbox threads.
 */
import { aliasedTable, and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { REPORT_STATUSES, ReportEntityType } from "../db/schema/reports.js";

export type DbLike = any;

const { contentReports, users } = schema;

export type ContentReportRow = typeof contentReports.$inferSelect;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export class ContentReportsRepository {
  constructor(private readonly db: DbLike) {}

  /** Reports the user filed, newest first. */
  async listForReporter(reporterId: string): Promise<ContentReportRow[]> {
    return (await this.db
      .select()
      .from(contentReports)
      .where(eq(contentReports.reporterId, reporterId))
      .orderBy(desc(contentReports.createdAt))) as ContentReportRow[];
  }

  /** Has this reporter EVER reported the entity (any status)? Backs the
   *  "report once" feed-post endpoint. */
  async hasReported(reporterId: string, entityType: ReportEntityType, entityId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: contentReports.id })
      .from(contentReports)
      .where(
        and(
          eq(contentReports.reporterId, reporterId),
          eq(contentReports.entityType, entityType),
          eq(contentReports.entityId, entityId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** Admin triage queue — joins reporter + entity owner so the queue UI can
   *  render both name chips without N+1 fetches. */
  async listQueue(status: ReportStatus | null, limit: number) {
    const ownerUsers = aliasedTable(users, "owner_users");
    const base = this.db
      .select({
        report: contentReports,
        reporter: { id: users.id, name: users.name, email: users.email },
        owner: { id: ownerUsers.id, name: ownerUsers.name, email: ownerUsers.email },
      })
      .from(contentReports)
      .innerJoin(users, eq(contentReports.reporterId, users.id))
      .leftJoin(ownerUsers, eq(contentReports.entityOwnerId, ownerUsers.id));
    const filtered = status ? base.where(eq(contentReports.status, status)) : base;
    return filtered.orderBy(desc(contentReports.createdAt)).limit(limit);
  }
}
