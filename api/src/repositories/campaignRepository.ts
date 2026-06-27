/**
 * CampaignRepository — pure data access for the email campaign engine
 * (migration 0204): campaigns, their recipients, the email-template library,
 * and the global suppression list.
 *
 * No business logic / rendering / provider calls — that lives in
 * services/campaigns/CampaignService.ts, which owns audience resolution, the
 * read-through cache, and the send loop.
 */
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  emailCampaigns,
  emailCampaignRecipients,
  emailTemplates,
} = schema;

export type DbLike = any;
export type CampaignRow = typeof emailCampaigns.$inferSelect;
export type CampaignInsert = typeof emailCampaigns.$inferInsert;
export type RecipientRow = typeof emailCampaignRecipients.$inferSelect;
export type RecipientInsert = typeof emailCampaignRecipients.$inferInsert;
export type TemplateRow = typeof emailTemplates.$inferSelect;
export type TemplateInsert = typeof emailTemplates.$inferInsert;

export interface RecipientStatCounts {
  total: number;
  sent: number;
  opened: number;
  clicked: number;
  failed: number;
  pending: number;
}

export interface ICampaignRepository {
  // Campaigns
  listCampaigns(): Promise<CampaignRow[]>;
  /** Campaigns created by one user — the user-facing Outreach surface (#1970).
   *  Same shape + ordering as `listCampaigns`, scoped to `createdByUserId`. */
  listCampaignsByUser(userId: string): Promise<CampaignRow[]>;
  findCampaign(id: string): Promise<CampaignRow | null>;
  createCampaign(values: CampaignInsert): Promise<CampaignRow>;
  updateCampaign(id: string, patch: Partial<CampaignInsert>): Promise<CampaignRow | null>;
  /** Atomically flip due `scheduled` campaigns to `sending`, returning the
   *  claimed rows (so two overlapping cron ticks can't double-claim). */
  promoteDueScheduled(now: Date): Promise<CampaignRow[]>;
  listSending(limit: number): Promise<CampaignRow[]>;

  // Recipients
  insertRecipients(rows: RecipientInsert[]): Promise<number>;
  listPendingRecipients(campaignId: string, limit: number): Promise<RecipientRow[]>;
  markRecipient(id: string, patch: Partial<RecipientInsert>): Promise<void>;
  countRecipientStats(campaignId: string): Promise<RecipientStatCounts>;
  /** One grouped query for the whole list view — avoids an N+1 stats fan-out. */
  statsByCampaign(): Promise<Map<string, RecipientStatCounts>>;
  countPending(campaignId: string): Promise<number>;
  findRecipient(id: string): Promise<RecipientRow | null>;

  // Templates
  listTemplates(): Promise<TemplateRow[]>;
  findTemplate(id: string): Promise<TemplateRow | null>;
  createTemplate(values: TemplateInsert): Promise<TemplateRow>;
  updateTemplate(id: string, patch: Partial<TemplateInsert>): Promise<TemplateRow | null>;
  deleteTemplate(id: string): Promise<boolean>;
}

export class CampaignRepository implements ICampaignRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── Campaigns ─────────────────────────────────────────────────────────────
  async listCampaigns(): Promise<CampaignRow[]> {
    return this.db
      .select()
      .from(emailCampaigns)
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(500);
  }

  async listCampaignsByUser(userId: string): Promise<CampaignRow[]> {
    return this.db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.createdByUserId, userId))
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(500);
  }

  async findCampaign(id: string): Promise<CampaignRow | null> {
    const [row] = await this.db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, id))
      .limit(1);
    return row ?? null;
  }

  async createCampaign(values: CampaignInsert): Promise<CampaignRow> {
    const [row] = await this.db.insert(emailCampaigns).values(values).returning();
    return row;
  }

  async updateCampaign(id: string, patch: Partial<CampaignInsert>): Promise<CampaignRow | null> {
    const [row] = await this.db
      .update(emailCampaigns)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(emailCampaigns.id, id))
      .returning();
    return row ?? null;
  }

  async promoteDueScheduled(now: Date): Promise<CampaignRow[]> {
    return this.db
      .update(emailCampaigns)
      .set({ status: "sending", updatedAt: now })
      .where(
        and(
          eq(emailCampaigns.status, "scheduled"),
          lte(emailCampaigns.scheduledAt, now),
        ),
      )
      .returning();
  }

  async listSending(limit: number): Promise<CampaignRow[]> {
    return this.db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.status, "sending"))
      .orderBy(asc(emailCampaigns.updatedAt))
      .limit(limit);
  }

  // ── Recipients ──────────────────────────────────────────────────────────────
  async insertRecipients(rows: RecipientInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    // Idempotent on (campaign_id, email) so a resumed audience-resolve doesn't
    // duplicate recipients.
    const inserted = await this.db
      .insert(emailCampaignRecipients)
      .values(rows)
      .onConflictDoNothing({
        target: [emailCampaignRecipients.campaignId, emailCampaignRecipients.email],
      })
      .returning({ id: emailCampaignRecipients.id });
    return inserted.length;
  }

  async listPendingRecipients(campaignId: string, limit: number): Promise<RecipientRow[]> {
    return this.db
      .select()
      .from(emailCampaignRecipients)
      .where(
        and(
          eq(emailCampaignRecipients.campaignId, campaignId),
          eq(emailCampaignRecipients.status, "pending"),
        ),
      )
      .orderBy(asc(emailCampaignRecipients.createdAt))
      .limit(limit);
  }

  async markRecipient(id: string, patch: Partial<RecipientInsert>): Promise<void> {
    await this.db
      .update(emailCampaignRecipients)
      .set(patch)
      .where(eq(emailCampaignRecipients.id, id));
  }

  async findRecipient(id: string): Promise<RecipientRow | null> {
    const [row] = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.id, id))
      .limit(1);
    return row ?? null;
  }

  async countRecipientStats(campaignId: string): Promise<RecipientStatCounts> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} IN ('sent','opened','clicked'))::int`,
        opened: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} IN ('opened','clicked'))::int`,
        clicked: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} = 'clicked')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} IN ('failed','bounced','suppressed'))::int`,
        pending: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} = 'pending')::int`,
      })
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.campaignId, campaignId));
    return (
      row ?? { total: 0, sent: 0, opened: 0, clicked: 0, failed: 0, pending: 0 }
    );
  }

  async statsByCampaign(): Promise<Map<string, RecipientStatCounts>> {
    const rows = await this.db
      .select({
        campaignId: emailCampaignRecipients.campaignId,
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} IN ('sent','opened','clicked'))::int`,
        opened: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} IN ('opened','clicked'))::int`,
        clicked: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} = 'clicked')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} IN ('failed','bounced','suppressed'))::int`,
        pending: sql<number>`count(*) FILTER (WHERE ${emailCampaignRecipients.status} = 'pending')::int`,
      })
      .from(emailCampaignRecipients)
      .groupBy(emailCampaignRecipients.campaignId);
    const map = new Map<string, RecipientStatCounts>();
    for (const r of rows as Array<{ campaignId: string } & RecipientStatCounts>) {
      map.set(r.campaignId, {
        total: r.total,
        sent: r.sent,
        opened: r.opened,
        clicked: r.clicked,
        failed: r.failed,
        pending: r.pending,
      });
    }
    return map;
  }

  async countPending(campaignId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailCampaignRecipients)
      .where(
        and(
          eq(emailCampaignRecipients.campaignId, campaignId),
          eq(emailCampaignRecipients.status, "pending"),
        ),
      );
    return row?.n ?? 0;
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  async listTemplates(): Promise<TemplateRow[]> {
    return this.db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
  }

  async findTemplate(id: string): Promise<TemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .limit(1);
    return row ?? null;
  }

  async createTemplate(values: TemplateInsert): Promise<TemplateRow> {
    const [row] = await this.db.insert(emailTemplates).values(values).returning();
    return row;
  }

  async updateTemplate(id: string, patch: Partial<TemplateInsert>): Promise<TemplateRow | null> {
    const [row] = await this.db
      .update(emailTemplates)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return row ?? null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, id))
      .returning({ id: emailTemplates.id });
    return rows.length > 0;
  }
}
