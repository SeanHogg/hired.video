/**
 * CampaignService — the single email-campaign engine. Every campaign surface
 * (user-facing Outreach, SuperAdmin marketing) drives through this service:
 * create/update, audience resolution, scheduling, the cron-driven send loop,
 * the email-template library, and unsubscribe/suppression.
 *
 * Layering: business logic + rendering + provider calls live here; pure data
 * access is CampaignRepository; cross-aggregate audience READS (users,
 * marketing_leads) are read-only projections done inline against the db handle
 * (they don't mutate those aggregates, so they don't warrant owning repos).
 */
import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { getEmailProvider } from "../adapters/email.js";
import { MarketingConsentService } from "../email/MarketingConsentService.js";
import { buildRepos } from "../../repositories/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import {
  CAMPAIGN_STATUS_LABELS,
  renderTemplateBody,
  type AudiencePreview,
  type CampaignAudience,
  type CampaignDTO,
  type CampaignStatus,
  type CampaignTemplateDTO,
  type CreateCampaignInput,
  type CreateTemplateInput,
  type UpdateCampaignInput,
} from "../../../../shared/campaigns.js";
import {
  DEFAULT_MARKETING_CATEGORY,
  isMarketingCategory,
  type MarketingCategory,
} from "../../../../shared/email-consent.js";
import type {
  CampaignRepository,
  CampaignRow,
  RecipientInsert,
  RecipientStatCounts,
  TemplateRow,
} from "../../repositories/campaignRepository.js";

const LIST_CACHE_KEY = "campaigns:list:all";
const LIST_CACHE_TTL = 60;

/** Per cron tick: campaigns to advance + recipients to send. Bounded so a
 *  single Cloudflare Worker invocation can't blow the CPU budget. */
const CAMPAIGNS_PER_TICK = 5;
const RECIPIENTS_PER_CAMPAIGN_PER_TICK = 100;
const EMPTY_STATS: RecipientStatCounts = {
  total: 0, sent: 0, opened: 0, clicked: 0, failed: 0, pending: 0,
};

export interface ResolvedRecipient {
  email: string;
  name?: string;
  userId?: string;
  personalization: Record<string, string>;
}

/** Flat result so call sites don't depend on discriminated-union narrowing
 *  (this tsconfig doesn't narrow boolean discriminants reliably). */
export interface ScheduleResult {
  ok: boolean;
  campaign?: CampaignDTO;
  reason?: string;
}

export interface CreateCampaignContext {
  createdByUserId: string;
  /** Sender attribution — the hired.video platform company for SA marketing. */
  senderCompanyId?: string | null;
}

function getEnv(key: string): string {
  return (
    process.env[key] ||
    ((globalThis as any).__ENV?.[key] as string | undefined) ||
    ""
  );
}

function frontendBase(): string {
  const url = getEnv("FRONTEND_URL");
  return url.split(",")[0]?.trim().replace(/\/$/, "") || "https://hired.video";
}

export class CampaignService {
  constructor(
    private readonly repo: CampaignRepository,
    private readonly db: any,
    private readonly consent: MarketingConsentService,
  ) {}

  /** Wire the engine + its consent gate from a db handle. Use this at call
   *  sites instead of hand-constructing the dependency graph. */
  static create(db: any): CampaignService {
    const repos = buildRepos(db);
    return new CampaignService(
      repos.campaigns as any,
      db,
      new MarketingConsentService(repos.emailConsent as any),
    );
  }

  // ── Mapping ───────────────────────────────────────────────────────────────
  private toDTO(row: CampaignRow, stats: RecipientStatCounts): CampaignDTO {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      subject: row.subject,
      templateId: row.templateId ?? null,
      status: row.status as CampaignStatus,
      audience: (row.audience as CampaignAudience | null) ?? null,
      fromName: row.fromName ?? null,
      senderCompanyId: row.senderCompanyId ?? null,
      createdByUserId: row.createdByUserId ?? null,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      stats,
    };
  }

  private toTemplateDTO(row: TemplateRow): CampaignTemplateDTO {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      htmlBody: row.htmlBody,
      textBody: row.textBody ?? null,
      variables: Array.isArray(row.variables) ? (row.variables as string[]) : [],
      isActive: row.isActive,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  // ── Reads ─────────────────────────────────────────────────────────────────
  /** Cached list (read-through L1+L2, invalidated on every write). One grouped
   *  stats query — no N+1. */
  async list(): Promise<CampaignDTO[]> {
    return getOrSetCached<CampaignDTO[]>({
      key: LIST_CACHE_KEY,
      ttlSeconds: LIST_CACHE_TTL,
      loader: async () => {
        const [rows, statsMap] = await Promise.all([
          this.repo.listCampaigns(),
          this.repo.statsByCampaign(),
        ]);
        return rows.map((r) => this.toDTO(r, statsMap.get(r.id) ?? EMPTY_STATS));
      },
    });
  }

  async get(id: string): Promise<CampaignDTO | null> {
    const row = await this.repo.findCampaign(id);
    if (!row) return null;
    return this.toDTO(row, await this.repo.countRecipientStats(id));
  }

  async listTemplates(): Promise<CampaignTemplateDTO[]> {
    const rows = await this.repo.listTemplates();
    return rows.map((r) => this.toTemplateDTO(r));
  }

  // ── Writes ──────────────────────────────────────────────────────────────────
  async create(input: CreateCampaignInput, ctx: CreateCampaignContext): Promise<CampaignDTO> {
    const row = await this.repo.createCampaign({
      name: input.name,
      subject: input.subject,
      description: input.description ?? null,
      templateId: input.templateId ?? null,
      htmlBody: input.htmlBody ?? null,
      fromName: input.fromName ?? null,
      audience: (input.audience as Record<string, unknown> | undefined) ?? null,
      status: input.status ?? "draft",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      senderCompanyId: ctx.senderCompanyId ?? null,
      createdByUserId: ctx.createdByUserId,
    } as any);
    this.bust();
    return this.toDTO(row, EMPTY_STATS);
  }

  async update(id: string, input: UpdateCampaignInput): Promise<CampaignDTO | null> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.templateId !== undefined) patch.templateId = input.templateId ?? null;
    if (input.htmlBody !== undefined) patch.htmlBody = input.htmlBody ?? null;
    if (input.fromName !== undefined) patch.fromName = input.fromName ?? null;
    if (input.audience !== undefined) patch.audience = input.audience ?? null;
    if (input.status !== undefined) patch.status = input.status;
    if (input.scheduledAt !== undefined) {
      patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    }
    const row = await this.repo.updateCampaign(id, patch as any);
    if (!row) return null;
    this.bust();
    return this.toDTO(row, await this.repo.countRecipientStats(id));
  }

  /**
   * Move a draft/paused campaign to `scheduled`. `scheduledAt` null/omitted ⇒
   * send on the next cron tick (effectively "send now"). Validates that the
   * campaign has content + an audience before committing.
   */
  async schedule(
    id: string,
    scheduledAt: string | null | undefined,
  ): Promise<ScheduleResult> {
    const row = await this.repo.findCampaign(id);
    if (!row) return { ok: false, reason: "Campaign not found" };
    const content = await this.resolveContent(row);
    if (!content) return { ok: false, reason: "Campaign has no body — attach a template or write inline content first" };
    if (!row.audience) return { ok: false, reason: "Campaign has no audience selected" };
    // Past/now timestamps collapse to "due immediately".
    const when = scheduledAt ? new Date(scheduledAt) : new Date(0);
    const updated = await this.repo.updateCampaign(id, {
      status: "scheduled",
      scheduledAt: when,
    } as any);
    this.bust();
    return { ok: true, campaign: this.toDTO(updated!, await this.repo.countRecipientStats(id)) };
  }

  async setStatus(id: string, status: CampaignStatus): Promise<CampaignDTO | null> {
    const row = await this.repo.updateCampaign(id, { status } as any);
    if (!row) return null;
    this.bust();
    return this.toDTO(row, await this.repo.countRecipientStats(id));
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  async createTemplate(input: CreateTemplateInput): Promise<CampaignTemplateDTO> {
    const row = await this.repo.createTemplate({
      name: input.name,
      subject: input.subject,
      htmlBody: input.htmlBody,
      textBody: input.textBody ?? null,
      variables: input.variables ?? [],
      isActive: input.isActive ?? true,
    } as any);
    return this.toTemplateDTO(row);
  }

  async updateTemplate(id: string, input: Partial<CreateTemplateInput>): Promise<CampaignTemplateDTO | null> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.htmlBody !== undefined) patch.htmlBody = input.htmlBody;
    if (input.textBody !== undefined) patch.textBody = input.textBody ?? null;
    if (input.variables !== undefined) patch.variables = input.variables;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    const row = await this.repo.updateTemplate(id, patch as any);
    return row ? this.toTemplateDTO(row) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.repo.deleteTemplate(id);
  }

  // ── Audience resolution ─────────────────────────────────────────────────────
  /** Dry-run: count + a small sample for the composer's "≈ N recipients". */
  async previewAudience(audience: CampaignAudience): Promise<AudiencePreview> {
    const resolved = await this.resolveAudience(audience);
    return {
      count: resolved.length,
      sample: resolved.slice(0, 10).map((r) => ({ email: r.email, name: r.name })),
    };
  }

  /** Resolve an audience to a deduped, suppression-filtered recipient list. */
  private async resolveAudience(audience: CampaignAudience): Promise<ResolvedRecipient[]> {
    let raw: ResolvedRecipient[] = [];

    if (audience.kind === "role") {
      const { users } = schema;
      const conds = [inArray(users.role, audience.roles), isNotNull(users.email)];
      if (!audience.includeInactive) {
        conds.push(eq(users.isActive, true));
        conds.push(eq(users.isBanned, false));
      }
      const rows = await this.db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(and(...conds))
        .limit(50000);
      raw = rows.map((u: { id: string; email: string; name: string }) => ({
        email: u.email,
        name: u.name,
        userId: u.id,
        personalization: { name: u.name ?? "", email: u.email },
      }));
    } else if (audience.kind === "leads") {
      const { marketingLeads } = schema;
      const conds = [isNotNull(marketingLeads.email)];
      if (audience.sourcePrefix) {
        conds.push(like(marketingLeads.source, `${audience.sourcePrefix}%`));
      }
      if (audience.status) {
        conds.push(eq(marketingLeads.status, audience.status));
      }
      const rows = await this.db
        .select({ email: marketingLeads.email, name: marketingLeads.name, company: marketingLeads.company })
        .from(marketingLeads)
        .where(and(...conds))
        .limit(50000);
      raw = rows.map((l: { email: string; name: string | null; company: string | null }) => ({
        email: l.email,
        name: l.name ?? undefined,
        personalization: { name: l.name ?? "", email: l.email, company: l.company ?? "" },
      }));
    } else {
      raw = audience.recipients.map((r) => ({
        email: r.email,
        name: r.name,
        personalization: { name: r.name ?? "", email: r.email },
      }));
    }

    // Dedup by lowercased email (first wins).
    const byEmail = new Map<string, ResolvedRecipient>();
    for (const r of raw) {
      const key = r.email.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, r);
    }
    const deduped = [...byEmail.values()];

    // Drop the global suppression list.
    const suppressed = await this.repo.filterSuppressed(deduped.map((r) => r.email));
    return deduped.filter((r) => !suppressed.has(r.email.toLowerCase()));
  }

  // ── Send engine (cron) ────────────────────────────────────────────────────
  /**
   * Cron entry point. Promotes due `scheduled` campaigns to `sending`, then
   * drains a bounded batch of pending recipients per in-flight campaign.
   * Idempotent + resumable: recipient population is ON CONFLICT DO NOTHING and
   * a partially-sent campaign stays `sending` until its queue is empty.
   */
  async processDue(now: Date): Promise<{ promoted: number; processed: number; sent: number; failed: number }> {
    const promotedRows = await this.repo.promoteDueScheduled(now);
    const sendingRows = await this.repo.listSending(CAMPAIGNS_PER_TICK);

    let processed = 0;
    let sent = 0;
    let failed = 0;
    for (const campaign of sendingRows) {
      try {
        const r = await this.sendCampaignBatch(campaign, now);
        processed += 1;
        sent += r.sent;
        failed += r.failed;
      } catch (err) {
        console.error(`[campaigns] send batch failed for ${campaign.id}:`, err);
      }
    }
    if (promotedRows.length > 0 || processed > 0) this.bust();
    return { promoted: promotedRows.length, processed, sent, failed };
  }

  private async sendCampaignBatch(
    campaign: CampaignRow,
    now: Date,
  ): Promise<{ sent: number; failed: number }> {
    // Populate recipients the first time we touch a sending campaign.
    const stats = await this.repo.countRecipientStats(campaign.id);
    if (stats.total === 0) {
      const audience = campaign.audience as CampaignAudience | null;
      if (!audience) {
        await this.repo.updateCampaign(campaign.id, { status: "cancelled" } as any);
        console.warn(`[campaigns] ${campaign.id} has no audience — cancelling`);
        return { sent: 0, failed: 0 };
      }
      const recipients = await this.resolveAudience(audience);
      if (recipients.length === 0) {
        await this.repo.updateCampaign(campaign.id, {
          status: "sent",
          sentAt: now,
        } as any);
        return { sent: 0, failed: 0 };
      }
      const insertRows: RecipientInsert[] = recipients.map((r) => ({
        campaignId: campaign.id,
        userId: r.userId ?? null,
        email: r.email,
        name: r.name ?? null,
        personalization: r.personalization,
        status: "pending",
      })) as any;
      await this.repo.insertRecipients(insertRows);
    }

    const content = await this.resolveContent(campaign);
    if (!content) {
      await this.repo.updateCampaign(campaign.id, { status: "paused" } as any);
      console.warn(`[campaigns] ${campaign.id} has no body — pausing`);
      return { sent: 0, failed: 0 };
    }

    const provider = getEmailProvider();
    const batch = await this.repo.listPendingRecipients(
      campaign.id,
      RECIPIENTS_PER_CAMPAIGN_PER_TICK,
    );
    const fromName = campaign.fromName || "hired.video";

    let sent = 0;
    let failed = 0;
    for (const recipient of batch) {
      const vars = {
        ...(recipient.personalization ?? {}),
        name: recipient.name ?? (recipient.personalization as any)?.name ?? "there",
        email: recipient.email,
      } as Record<string, string>;
      const subject = renderTemplateBody(content.subject, vars);
      const bodyInner = renderTemplateBody(content.html, vars);
      const html = await this.wrapBody(bodyInner, recipient.email, campaign.id, recipient.id);

      if (!provider) {
        await this.repo.markRecipient(recipient.id, {
          status: "failed",
          errorMessage: "No email provider configured",
        } as any);
        failed += 1;
        continue;
      }
      try {
        await provider.send({ to: recipient.email, subject, html, fromName });
        await this.repo.markRecipient(recipient.id, { status: "sent", sentAt: now } as any);
        sent += 1;
      } catch (err: any) {
        await this.repo.markRecipient(recipient.id, {
          status: "failed",
          errorMessage: String(err?.message ?? err),
        } as any);
        failed += 1;
      }
    }

    // No more pending ⇒ campaign is done.
    const remaining = await this.repo.countPending(campaign.id);
    if (remaining === 0) {
      await this.repo.updateCampaign(campaign.id, { status: "sent", sentAt: now } as any);
    }
    return { sent, failed };
  }

  /** Resolve a campaign's effective subject + html (inline body wins; else the
   *  attached template). Returns null when neither yields content. */
  private async resolveContent(
    campaign: CampaignRow,
  ): Promise<{ subject: string; html: string } | null> {
    if (campaign.htmlBody && campaign.htmlBody.trim().length > 0) {
      return { subject: campaign.subject, html: campaign.htmlBody };
    }
    if (campaign.templateId) {
      const template = await this.repo.findTemplate(campaign.templateId);
      if (template) {
        return {
          subject: campaign.subject || template.subject,
          html: template.htmlBody,
        };
      }
    }
    return null;
  }

  // ── Unsubscribe / suppression ───────────────────────────────────────────────
  private async sign(email: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getJwtSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`unsub:${email.toLowerCase()}`),
    );
    return Buffer.from(new Uint8Array(sig)).toString("base64url");
  }

  /** One-click unsubscribe URL embedded in every campaign footer. */
  async buildUnsubscribeUrl(email: string, campaignId: string): Promise<string> {
    const token = await this.sign(email);
    const e = Buffer.from(email.toLowerCase(), "utf-8").toString("base64url");
    return `${frontendBase()}/api/campaigns/unsubscribe?e=${e}&c=${campaignId}&t=${encodeURIComponent(token)}`;
  }

  /** Verify the HMAC and add the address to the global suppression list. */
  async unsubscribe(email: string, token: string, campaignId?: string | null): Promise<boolean> {
    const expected = await this.sign(email);
    if (token !== expected) return false;
    await this.repo.addSuppression(email, "unsubscribe", campaignId ?? null);
    return true;
  }

  /** Mark a recipient opened (tracking-pixel hit). Best-effort, never throws. */
  async markOpened(recipientId: string): Promise<void> {
    try {
      const r = await this.repo.findRecipient(recipientId);
      // Only advance pending→opened forward; never downgrade clicked.
      if (r && (r.status === "sent")) {
        await this.repo.markRecipient(recipientId, {
          status: "opened",
          openedAt: new Date(),
        } as any);
        this.bust();
      }
    } catch {
      /* swallow — open tracking must never break pixel delivery */
    }
  }

  // ── Email chrome ────────────────────────────────────────────────────────────
  /** Wrap rendered body in a minimal layout + the required unsubscribe footer
   *  and a 1px open-tracking pixel. */
  private async wrapBody(
    inner: string,
    email: string,
    campaignId: string,
    recipientId: string,
  ): Promise<string> {
    const unsubUrl = await this.buildUnsubscribeUrl(email, campaignId);
    const pixel = `${frontendBase()}/api/campaigns/open/${recipientId}.png`;
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;line-height:1.6;">
    ${inner}
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;" />
    <p style="font-size:12px;color:#71717a;">
      You're receiving this because you're part of the hired.video community.
      <a href="${unsubUrl}" style="color:#71717a;">Unsubscribe</a>.
    </p>
  </div>
  <img src="${pixel}" alt="" width="1" height="1" style="display:none" />
</body></html>`;
  }

  private bust(): void {
    invalidateCachedKey(LIST_CACHE_KEY);
  }
}

/** Label helper re-exported for routes that surface status in audit metadata. */
export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABELS[status as CampaignStatus] ?? status;
}
