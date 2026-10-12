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
import { rewriteLinksForClickTracking } from "./campaign-links.js";
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
      category: (isMarketingCategory(row.category) ? row.category : DEFAULT_MARKETING_CATEGORY),
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

  /** Campaigns created by one user — the user-facing Outreach surface (#1970).
   *  Same DTO shape (string status + stats + audience) the SuperAdmin list
   *  returns, so both surfaces drive the one reusable `<CampaignList>`. One
   *  grouped stats query, then an in-memory filter to the user's rows — no
   *  per-campaign N+1. */
  async listByUser(userId: string): Promise<CampaignDTO[]> {
    const [rows, statsMap] = await Promise.all([
      this.repo.listCampaignsByUser(userId),
      this.repo.statsByCampaign(),
    ]);
    return rows.map((r) => this.toDTO(r, statsMap.get(r.id) ?? EMPTY_STATS));
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
      category: input.category ?? DEFAULT_MARKETING_CATEGORY,
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
    if (input.category !== undefined) patch.category = input.category;
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
  /** Dry-run: count + a small sample for the composer's "≈ N recipients".
   *  Counts AFTER applying opt-outs for the campaign's category. */
  async previewAudience(
    audience: CampaignAudience,
    category: MarketingCategory = DEFAULT_MARKETING_CATEGORY,
  ): Promise<AudiencePreview> {
    const resolved = await this.resolveAudience(audience, category);
    return {
      count: resolved.length,
      sample: resolved.slice(0, 10).map((r) => ({ email: r.email, name: r.name })),
    };
  }

  /** Resolve an audience to a deduped, consent-filtered recipient list (drops
   *  hard suppressions + master opt-outs + opt-outs for `category`). */
  private async resolveAudience(
    audience: CampaignAudience,
    category: MarketingCategory,
  ): Promise<ResolvedRecipient[]> {
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

    // Drop hard suppressions + marketing opt-outs for this category (batched).
    return this.consent.filterMailable(deduped, category);
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
      const category = isMarketingCategory(campaign.category)
        ? campaign.category
        : DEFAULT_MARKETING_CATEGORY;
      const recipients = await this.resolveAudience(audience, category);
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
    // Status writes are buffered and flushed as one UPDATE per distinct
    // (status, errorMessage) group. Flushed every MARK_FLUSH_EVERY sends
    // (and in `finally`) so a worker killed mid-tick can only leave a small
    // window of already-sent recipients still `pending` (re-send risk),
    // rather than the whole batch.
    const MARK_FLUSH_EVERY = 20;
    const sentIds: string[] = [];
    const failedByMessage = new Map<string, string[]>();
    let buffered = 0;
    const flushMarks = async () => {
      const sentNow = sentIds.splice(0);
      const failedNow = [...failedByMessage.entries()];
      failedByMessage.clear();
      buffered = 0;
      await Promise.all([
        this.repo.markRecipients(sentNow, { status: "sent", sentAt: now }),
        ...failedNow.map(([errorMessage, ids]) =>
          this.repo.markRecipients(ids, { status: "failed", errorMessage })),
      ]);
    };
    const markFailed = (id: string, message: string) => {
      const ids = failedByMessage.get(message) ?? [];
      ids.push(id);
      failedByMessage.set(message, ids);
      buffered += 1;
    };

    try {
      for (const recipient of batch) {
        if (!provider) {
          markFailed(recipient.id, "No email provider configured");
          failed += 1;
          continue;
        }
        const vars = {
          ...(recipient.personalization ?? {}),
          name: recipient.name ?? (recipient.personalization as any)?.name ?? "there",
          email: recipient.email,
        } as Record<string, string>;
        const subject = renderTemplateBody(content.subject, vars);
        const bodyInner = renderTemplateBody(content.html, vars);
        const html = await this.wrapBody(bodyInner, recipient.email, recipient.userId ?? null, recipient.id);

        try {
          await provider.send({ to: recipient.email, subject, html, fromName });
          sentIds.push(recipient.id);
          buffered += 1;
          sent += 1;
        } catch (err: any) {
          markFailed(recipient.id, String(err?.message ?? err));
          failed += 1;
        }
        if (buffered >= MARK_FLUSH_EVERY) await flushMarks();
      }
    } finally {
      await flushMarks();
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

  /**
   * Mark a recipient clicked (signed click-redirect hit). A click implies an
   * open, so this advances sent/opened → clicked (forward-only; never downgrades
   * an already-clicked row, and never resurrects a failed one). Best-effort —
   * the redirect must succeed even if the stat write fails. Also stamps
   * `openedAt` when the click arrived before any pixel load (image-blocked
   * clients), so the open metric stays consistent with the click.
   */
  async markClicked(recipientId: string): Promise<void> {
    try {
      const r = await this.repo.findRecipient(recipientId);
      if (r && (r.status === "sent" || r.status === "opened")) {
        const now = new Date();
        await this.repo.markRecipient(recipientId, {
          status: "clicked",
          clickedAt: now,
          openedAt: r.openedAt ?? now,
        } as any);
        this.bust();
      }
    } catch {
      /* swallow — click tracking must never break the redirect */
    }
  }

  // ── Email chrome ────────────────────────────────────────────────────────────
  /** Wrap rendered body in a minimal layout + the CAN-SPAM-required footer
   *  (one-click unsubscribe + manage-preferences link + physical postal
   *  address) and a 1px open-tracking pixel. The unsubscribe link carries an
   *  opaque token — never the email. Outbound body links are rewritten through
   *  the signed click-redirect so the `clicked` recipient stat advances; the
   *  footer's own unsubscribe/manage links are added AFTER rewriting and stay
   *  direct. */
  private async wrapBody(
    inner: string,
    email: string,
    userId: string | null,
    recipientId: string,
  ): Promise<string> {
    const base = frontendBase();
    const trackedInner = await rewriteLinksForClickTracking(inner, recipientId, base);
    const { unsubscribeUrl, manageUrl } = await this.consent.footerLinks(email, userId);
    const pixel = `${base}/api/campaigns/open/${recipientId}.png`;
    // CAN-SPAM footer contact — a real registered postal address (#1977), not a
    // placeholder. The env override still wins if the address ever changes
    // without a redeploy.
    const postalAddress =
      getEnv("EMAIL_PHYSICAL_ADDRESS") || "hired.video — 6513 Basswood Dr, Troy, MI 48098";
    return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;line-height:1.6;">
    ${trackedInner}
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;" />
    <p style="font-size:12px;color:#71717a;">
      You're receiving this because you're part of the hired.video community.
      <a href="${unsubscribeUrl}" style="color:#71717a;">Unsubscribe</a> ·
      <a href="${manageUrl}" style="color:#71717a;">Manage email preferences</a>.
    </p>
    <p style="font-size:11px;color:#a1a1aa;">${postalAddress}</p>
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
