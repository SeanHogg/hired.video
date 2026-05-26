/**
 * Redemption engine — converts points → tokens / premium month / gift
 * card. The single chokepoint every `/api/points/redeem` call hits.
 *
 * Lifecycle per kind:
 *
 *   ai_credits      pending → fulfilled  (synchronous; tokens hit the
 *                   user's wallet inside the same request)
 *   premium_month   pending → fulfilled  (synchronous; user_plan_overrides
 *                   row upserted with expiresAt = now + 30d)
 *   gift_card       pending → queued → fulfilled  (async via Tremendous;
 *                   queued = Tremendous accepted the order, fulfilled =
 *                   Tremendous reports SHIPPED on a later poll). If the
 *                   user crosses the $599 1099-MISC YTD threshold and
 *                   hasn't filed a W-9, the row is `requires_kyc=true`
 *                   and parked at `pending` for SuperAdmin review.
 *
 * Suspension and balance checks happen BEFORE the points debit. The
 * debit + ledger write are paired through `PointsEngine.writeManualLedger`
 * so a failed downstream call (Tremendous outage, plan-override repo
 * error) writes a reverse ledger row to refund the user.
 */

import type { Repos } from "../../repositories/index.js";
import type { PointRedemptionRow } from "../../repositories/pointsRepository.js";
import { getRedemptionSku, type RedemptionSku } from "./rules.js";
import { TremendousClient, TremendousError } from "../../services/tremendous/client.js";

/** 1099-MISC reporting threshold. IRS treats gift cards as taxable
 *  income for non-employees; we trigger KYC at this dollar amount. */
export const W9_YTD_THRESHOLD_CENTS = 59900; // $599

export interface RedemptionUserContext {
  userId: string;
  /** Recipient name + email for Tremendous gift-card delivery. For
   *  ai_credits / premium_month the engine ignores these. */
  recipientName?: string;
  recipientEmail?: string;
}

export type RedemptionOutcome =
  | { status: "fulfilled"; redemption: PointRedemptionRow }
  | { status: "queued"; redemption: PointRedemptionRow }
  | { status: "pending_kyc"; redemption: PointRedemptionRow }
  | { status: "rejected"; reason: RedemptionRejectReason; message: string };

export type RedemptionRejectReason =
  | "unknown_sku"
  | "suspended"
  | "insufficient_balance"
  | "vendor_unavailable";

export interface RedemptionEngineDeps {
  repos: Repos;
  /** Builds a Tremendous client from worker env. Injected so tests can
   *  pass a fake. Returns null when the gift-card vendor is intentionally
   *  disabled (sandbox / dev) — the engine surfaces `vendor_unavailable`
   *  on `gift_card` kinds in that case but still serves the other kinds. */
  buildTremendous: () => TremendousClient | null;
  now?: () => Date;
}

export class RedemptionEngine {
  private readonly now: () => Date;

  constructor(private readonly deps: RedemptionEngineDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async redeem(args: {
    skuId: string;
    user: RedemptionUserContext;
  }): Promise<RedemptionOutcome> {
    const sku = getRedemptionSku(args.skuId);
    if (!sku) {
      return {
        status: "rejected",
        reason: "unknown_sku",
        message: `Unknown SKU: ${args.skuId}`,
      };
    }

    const { repos } = this.deps;
    const balance = await repos.points.findBalance(args.user.userId);

    if (balance?.isSuspended) {
      return {
        status: "rejected",
        reason: "suspended",
        message: "Points are paused for review. Redemption is unavailable until support reinstates.",
      };
    }
    if ((balance?.balance ?? 0) < sku.pointsCost) {
      return {
        status: "rejected",
        reason: "insufficient_balance",
        message: `Need ${sku.pointsCost} points; you have ${balance?.balance ?? 0}.`,
      };
    }

    const valueCents = deriveValueCents(sku);
    // Campaign $ is platform-internal credit, not gift card / cash — IRS
    // treats it as a service rebate, not 1099 income. Skip the W-9 gate.
    const requiresKyc = sku.kind === "campaign_dollars"
      ? false
      : await this.crossesKycThreshold(args.user.userId, valueCents);

    // Insert the redemption row in pending state BEFORE debiting points;
    // gives us a row to refer to in the reverse path if anything fails.
    const redemption = await repos.points.insertRedemption({
      userId: args.user.userId,
      skuId: sku.id,
      kind: sku.kind,
      pointsCost: sku.pointsCost,
      valueCents,
      status: requiresKyc ? "pending" : "pending",
      grantPayload: {
        ...sku.grant,
        recipientName: args.user.recipientName ?? null,
        recipientEmail: args.user.recipientEmail ?? null,
      },
      requiresKyc,
    });

    // Debit points first. If fulfillment then fails, we write a reverse
    // ledger row to refund. Doing the debit early avoids the race where
    // a user clicks "redeem" twice and slips below threshold mid-flow.
    await this.debitPoints({
      userId: args.user.userId,
      delta: -sku.pointsCost,
      redemptionId: redemption.id,
      sku,
    });

    // Gift cards over the W-9 threshold park until SuperAdmin approval.
    if (requiresKyc && sku.kind === "gift_card") {
      const updated = await repos.points.updateRedemption(redemption.id, {
        status: "pending",
        metadata: { ...(redemption.metadata as object ?? {}), parkedForKyc: true },
      });
      return { status: "pending_kyc", redemption: updated };
    }

    // Synchronous kinds fulfill inside the request.
    try {
      switch (sku.kind) {
        case "ai_credits":
          return { status: "fulfilled", redemption: await this.fulfillAiCredits(redemption, sku) };
        case "premium_month":
          return { status: "fulfilled", redemption: await this.fulfillPremiumMonth(redemption, sku) };
        case "gift_card":
          return await this.fulfillGiftCard(redemption, sku, args.user);
        case "campaign_dollars":
          return { status: "fulfilled", redemption: await this.fulfillCampaignDollars(redemption, sku) };
      }
    } catch (e) {
      // Refund + mark redemption failed.
      await this.refundAndFail(redemption, sku, e);
      return {
        status: "rejected",
        reason: "vendor_unavailable",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ── KYC threshold ──────────────────────────────────────────────────

  private async crossesKycThreshold(userId: string, addCents: number): Promise<boolean> {
    const tax = await this.deps.repos.points.findTaxStatus(userId);
    const currentYear = this.now().getUTCFullYear();
    // Year roll-over: stored YTD belongs to a prior year; current year
    // YTD is effectively zero, so the only thing that crosses is the
    // current redemption itself.
    const existingYtd = tax && tax.ytdRedemptionYear === currentYear
      ? tax.ytdRedemptionCents
      : 0;
    const projected = existingYtd + addCents;
    if (projected < W9_YTD_THRESHOLD_CENTS) return false;
    return !tax?.w9CollectedAt;
  }

  // ── Per-kind fulfillment ───────────────────────────────────────────

  private async fulfillAiCredits(row: PointRedemptionRow, sku: RedemptionSku): Promise<PointRedemptionRow> {
    const tokens = Number(sku.grant.tokens ?? 0);
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new Error(`ai_credits SKU ${sku.id} missing valid grant.tokens`);
    }
    await this.deps.repos.tokens.upsertBalance(row.userId, tokens, tokens);
    return await this.markFulfilled(row);
  }

  private async fulfillPremiumMonth(row: PointRedemptionRow, sku: RedemptionSku): Promise<PointRedemptionRow> {
    const planSlug = String(sku.grant.planSlug ?? "pro");
    const durationDays = Number(sku.grant.durationDays ?? 30);
    const expiresAt = new Date(this.now().getTime() + durationDays * 86_400_000);

    await this.deps.repos.subscriptions.upsertOverride({
      userId: row.userId,
      planSlug,
      expiresAt,
      reason: `points_redemption:${sku.id}`,
      // Self-granted via points redemption — there's no superadmin in
      // the loop, so the user is recorded as their own grantor.
      grantedBy: row.userId,
    });

    return await this.markFulfilled(row);
  }

  private async fulfillGiftCard(
    row: PointRedemptionRow,
    sku: RedemptionSku,
    user: RedemptionUserContext,
  ): Promise<RedemptionOutcome> {
    const tremendous = this.deps.buildTremendous();
    if (!tremendous) {
      throw new TremendousError(503, "Gift card vendor not configured (Tremendous env missing)");
    }
    if (!user.recipientName || !user.recipientEmail) {
      throw new Error("recipientName + recipientEmail required for gift_card redemption");
    }

    const amountDollars = Math.round(Number(sku.grant.amountCents ?? 0)) / 100;
    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      throw new Error(`gift_card SKU ${sku.id} missing valid grant.amountCents`);
    }

    const order = await tremendous.createOrder({
      externalId: row.id, // redemption.id — Tremendous dedups on this
      recipientName: user.recipientName,
      recipientEmail: user.recipientEmail,
      amountDollars,
      message: "Thanks for using hired.video — enjoy your gift card!",
    });

    const updated = await this.deps.repos.points.updateRedemption(row.id, {
      status: order.status === "EXECUTED" || order.status === "PAID" ? "fulfilled" : "queued",
      vendorOrderId: order.orderId,
      fulfilledAt: order.status === "EXECUTED" || order.status === "PAID" ? this.now() : null,
    });

    // Bump YTD on success — order accepted, treat as taxable income for
    // 1099 purposes whether Tremendous has shipped yet or not.
    await this.deps.repos.points.bumpYtdRedemption(
      row.userId,
      row.valueCents,
      this.now().getUTCFullYear(),
    );

    return updated.status === "fulfilled"
      ? { status: "fulfilled", redemption: updated }
      : { status: "queued", redemption: updated };
  }

  private async markFulfilled(row: PointRedemptionRow): Promise<PointRedemptionRow> {
    // ai_credits + premium_month also count toward YTD for tax purposes.
    await this.deps.repos.points.bumpYtdRedemption(
      row.userId,
      row.valueCents,
      this.now().getUTCFullYear(),
    );
    return this.deps.repos.points.updateRedemption(row.id, {
      status: "fulfilled",
      fulfilledAt: this.now(),
    });
  }

  /** #169 — Campaign $ fulfillment. Grants `amountCents` into the user's
   *  campaign_dollars_balance row + writes an audit transaction. The
   *  boosts checkout flow (`api/src/routes/boosts.ts`) reads this
   *  balance before charging Stripe. No YTD bump — Campaign $ is
   *  platform-internal credit, not 1099 income. */
  private async fulfillCampaignDollars(
    row: PointRedemptionRow,
    sku: RedemptionSku,
  ): Promise<PointRedemptionRow> {
    const amountCents = Number(sku.grant.amountCents ?? row.valueCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error(`campaign_dollars SKU ${sku.id} missing valid grant.amountCents`);
    }
    await this.deps.repos.points.grantCampaignDollars({
      userId: row.userId,
      amountCents,
      redemptionId: row.id,
      description: `Redeemed ${sku.label} for ${sku.pointsCost} pts`,
    });
    return this.deps.repos.points.updateRedemption(row.id, {
      status: "fulfilled",
      fulfilledAt: this.now(),
    });
  }

  // ── SuperAdmin: approve a parked-for-KYC redemption ────────────────

  async approve(args: {
    redemptionId: string;
    approverId: string;
    recipientName?: string;
    recipientEmail?: string;
  }): Promise<PointRedemptionRow> {
    const row = await this.deps.repos.points.findRedemptionById(args.redemptionId);
    if (!row) throw new Error("redemption not found");
    if (row.status !== "pending") {
      throw new Error(`redemption ${args.redemptionId} is ${row.status}, not pending`);
    }

    await this.deps.repos.points.updateRedemption(args.redemptionId, {
      approvedBy: args.approverId,
      approvedAt: this.now(),
      kycCompletedAt: this.now(),
    });

    if (row.kind !== "gift_card") {
      return this.markFulfilled(row);
    }

    const tremendous = this.deps.buildTremendous();
    if (!tremendous) {
      return this.deps.repos.points.updateRedemption(args.redemptionId, {
        status: "failed",
        failureReason: "Tremendous not configured at approve time",
      });
    }

    const payload = (row.grantPayload as Record<string, unknown>) ?? {};
    const name = (args.recipientName ?? (payload.recipientName as string | undefined)) as string | undefined;
    const email = (args.recipientEmail ?? (payload.recipientEmail as string | undefined)) as string | undefined;
    if (!name || !email) {
      return this.deps.repos.points.updateRedemption(args.redemptionId, {
        status: "failed",
        failureReason: "Missing recipient name/email at approve time",
      });
    }

    const amountDollars = Math.round(Number(payload.amountCents ?? row.valueCents)) / 100;
    const order = await tremendous.createOrder({
      externalId: row.id,
      recipientName: name,
      recipientEmail: email,
      amountDollars,
    });
    const dispatched = order.status === "EXECUTED" || order.status === "PAID";
    if (dispatched) {
      await this.deps.repos.points.bumpYtdRedemption(
        row.userId,
        row.valueCents,
        this.now().getUTCFullYear(),
      );
    }
    return this.deps.repos.points.updateRedemption(args.redemptionId, {
      status: dispatched ? "fulfilled" : "queued",
      vendorOrderId: order.orderId,
      fulfilledAt: dispatched ? this.now() : null,
    });
  }

  /** Refund points + mark the redemption cancelled. The caller (SA
   *  endpoint) is trusted; balance manipulation is intentional. */
  async cancel(args: {
    redemptionId: string;
    reason: string;
    actorId: string;
  }): Promise<PointRedemptionRow> {
    const row = await this.deps.repos.points.findRedemptionById(args.redemptionId);
    if (!row) throw new Error("redemption not found");
    if (row.status !== "pending" && row.status !== "queued") {
      throw new Error(`redemption ${args.redemptionId} is ${row.status}; only pending/queued can be cancelled`);
    }
    await this.deps.repos.points.insertLedger({
      userId: row.userId,
      delta: row.pointsCost,
      category: "reverse",
      action: `redeem.${row.kind}.cancel`,
      source: "redemption",
      refId: row.id,
      refType: "point_redemption",
      metadata: { reason: args.reason, cancelledBy: args.actorId },
    });
    // Balance + ledger MUST share a category so lifetime counters line
    // up — `applyBalanceDelta` bumps lifetimeReversed when category is
    // "reverse", which matches the ledger row above.
    await this.deps.repos.points.applyBalanceDelta(row.userId, row.pointsCost, "reverse");
    return this.deps.repos.points.updateRedemption(args.redemptionId, {
      status: "cancelled",
      failureReason: args.reason,
    });
  }

  // ── Debit + refund helpers ─────────────────────────────────────────

  private async debitPoints(args: {
    userId: string;
    delta: number; // negative
    redemptionId: string;
    sku: RedemptionSku;
  }): Promise<void> {
    await this.deps.repos.points.insertLedger({
      userId: args.userId,
      delta: args.delta,
      category: "redeem",
      action: `redeem.${args.sku.kind}`,
      source: "redemption",
      refId: args.redemptionId,
      refType: "point_redemption",
      metadata: { skuId: args.sku.id, pointsCost: args.sku.pointsCost },
    });
    await this.deps.repos.points.applyBalanceDelta(args.userId, args.delta, "redeem");
  }

  private async refundAndFail(
    row: PointRedemptionRow,
    sku: RedemptionSku,
    err: unknown,
  ): Promise<void> {
    // Reverse the debit (write a positive ledger row + bump balance back).
    await this.deps.repos.points.insertLedger({
      userId: row.userId,
      delta: sku.pointsCost,
      category: "reverse",
      action: `redeem.${sku.kind}.refund`,
      source: "redemption",
      refId: row.id,
      refType: "point_redemption",
      metadata: { reason: err instanceof Error ? err.message : String(err) },
    });
    // Same category contract as cancel: keep balance + ledger in sync
    // so lifetimeReversed reflects every reversal path.
    await this.deps.repos.points.applyBalanceDelta(row.userId, sku.pointsCost, "reverse");
    await this.deps.repos.points.updateRedemption(row.id, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Best-effort retail-equivalent value of a redemption SKU for YTD
 *  tax tracking. Gift cards are $-denominated in `grant.amountCents`;
 *  ai_credits are valued at the token-pack cost-basis ($3/1M tokens
 *  retail per [[project_token_pricing]]); premium_month uses the Pro
 *  monthly retail price. */
function deriveValueCents(sku: RedemptionSku): number {
  switch (sku.kind) {
    case "gift_card":
      return Number(sku.grant.amountCents ?? 0);
    case "ai_credits": {
      const tokens = Number(sku.grant.tokens ?? 0);
      // 1M tokens = 300 cents retail (matches token-pack cost basis).
      return Math.round((tokens / 1_000_000) * 300);
    }
    case "premium_month":
      // Pro is $9.95/mo; 30d grant = same retail value.
      return 995;
  }
}
