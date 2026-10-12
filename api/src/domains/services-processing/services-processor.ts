// Services Processor — the central façade every metered/gated consumption
// event in hired.video routes through. Replaces the scattered
// `checkAIUsage` / `checkTeamSize` / `decideStudioQuota` / `requirePro`
// duplication with one entry point that:
//
//   • gate(userId, eventType, requestedQty)      — pre-flight pass/block
//   • meter(userId, eventType, quantity, meta)   — persist to usage_ledger
//   • getStatement(userId, periodStart)          — live preview for /settings
//   • closeMonth(periodStart)                    — cron rollup -> invoice
//
// Closes gap-register #765 (per-tool counts), #766 (saved searches + companies),
// #769 (dead FREE_MONTHLY_MATCHES / FREE_MONTHLY_APPLICATIONS) by routing every
// limit through one catalog and one ledger. The catalog
// ([entitlement-catalog.ts](./entitlement-catalog.ts)) is the only place a
// new limit needs to be declared; this file is event-type-agnostic.

import type { Context } from "hono";
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getSubscription } from "../../services/billing/BillingService.js";
import { isAdminRole } from "../billing/audience.js";
import type { JwtPayload } from "../../types/index.js";
import type {
  PlanTier,
  UsageEventType,
  UsageStatement,
  UsageStatementLine,
} from "../../../../shared/usage-statement.js";
import {
  ENTITLEMENT_CATALOG,
  getEntitlement,
  listEntitlements,
} from "./entitlement-catalog.js";

const UPGRADE_URL = "/pricing";

export class EntitlementExceededError extends Error {
  readonly code = "ENTITLEMENT_EXCEEDED" as const;
  constructor(
    public readonly eventType: UsageEventType,
    public readonly cap: number,
    public readonly consumed: number,
  ) {
    super(`Entitlement exceeded for ${eventType}: ${consumed}/${cap}`);
    this.name = "EntitlementExceededError";
  }
}

export interface MeterArgs {
  userId: string;
  eventType: UsageEventType;
  /** Defaults to 1. Use the actual token count for ai_tokens. */
  quantity?: number;
  /** Free-form metadata; persisted to `usage_ledger.metadata`. */
  metadata?: Record<string, unknown>;
  /** Override the plan tier resolution (used by tests + admin replay). */
  plan?: PlanTier;
  /** Override the bucketing timestamp; defaults to startOfMonthUtc(now). */
  periodStart?: Date;
}

export interface GateArgs {
  user: JwtPayload | null | undefined;
  eventType: UsageEventType;
  /** How many units the caller is about to consume. Defaults to 1. */
  quantity?: number;
}

export interface GateResult {
  allowed: boolean;
  reason: string | null;
  cap: number;
  consumed: number;
  remaining: number;
  plan: PlanTier;
}

export interface ServicesProcessor {
  /** Pre-flight: does this user have headroom for `quantity` units of
   *  `eventType` in the current monthly window? Anonymous + admin pass. */
  gate(args: GateArgs): Promise<GateResult>;

  /** Append-only ledger write. Idempotent at the call site — repeated calls
   *  with the same args produce multiple ledger rows by design (each call
   *  is one consumption event). */
  meter(args: MeterArgs): Promise<void>;

  /** Live or closed statement for `(userId, periodStart)`. If `periodStart`
   *  is omitted, returns the current calendar month preview. */
  getStatement(userId: string, periodStart?: Date): Promise<UsageStatement>;

  /** Route-handler ergonomics for `gate()` — returns either a `Response`
   *  (the 402 envelope to short-circuit with) when the caller is over their
   *  Free-tier cap, or `null` when they're allowed through. Anonymous + admin
   *  callers always get `null` (gate() handles that internally). */
  enforce(c: Context, eventType: UsageEventType, quantity?: number): Promise<Response | null>;

  /** Route-handler ergonomics for `meter()` — fire-and-forget, no-op when
   *  the request has no authenticated user, swallows ledger errors with a
   *  structured warn-log so a billing blip can never fail the user request. */
  meterEvent(c: Context, eventType: UsageEventType, metadata?: Record<string, unknown>, quantity?: number): void;
}

export function startOfMonthUtc(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function endOfMonthUtc(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

async function resolvePlan(userId: string): Promise<PlanTier> {
  const sub = await getSubscription(userId);
  if (sub.isPro) return "pro";
  // BillingService treats 'trialing' as Pro, so anything else is Free.
  return "free";
}

/**
 * Single-seam consumption count for any catalog dimension. `gate()` and
 * `getStatement()` both route through here; consumers that need a cap
 * check outside the Hono `Context` flow (e.g. the email-integration
 * OAuth `/connect` redirect handler that authenticates via `link_token`
 * and never builds a `JwtPayload`) call this directly to avoid
 * synthesising one.
 *
 * Dispatches on `spec.consumedSource` so a dimension's "what counts as
 * consumed" answer lives in exactly one place — the catalog entry.
 */
export async function loadConsumed(
  userId: string,
  eventType: UsageEventType,
  periodStart: Date = startOfMonthUtc(),
): Promise<number> {
  return consumedInPeriod(userId, eventType, periodStart);
}

async function consumedInPeriod(
  userId: string,
  eventType: UsageEventType,
  periodStart: Date,
): Promise<number> {
  const spec = getEntitlement(eventType);
  const source = spec.consumedSource ?? "ledger_monthly";
  const db = getDb();

  // Dispatch on `consumedSource` so the gate counts from the right table
  // for each dimension. Single seam: a new dimension declares its source
  // in the catalog, the gate reads from that source automatically.
  switch (source) {
    case "ledger_monthly": {
      const [row] = (await db
        .select({
          total: sql<number>`COALESCE(SUM(${schema.usageLedger.quantity}), 0)`,
        })
        .from(schema.usageLedger)
        .where(
          and(
            eq(schema.usageLedger.userId, userId),
            eq(schema.usageLedger.eventType, eventType),
            gte(schema.usageLedger.periodStart, periodStart),
            lt(schema.usageLedger.periodStart, endOfMonthUtc(periodStart)),
          ),
        )) as Array<{ total: number | string | null }>;
      const v = row?.total ?? 0;
      return typeof v === "string" ? Number(v) : v;
    }

    case "team_invitations_lifetime": {
      // Count pending + accepted invitations authored by this user. Cap
      // counts total team size, not invites per month.
      const [row] = (await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.accountInvitations)
        .where(
          and(
            eq(schema.accountInvitations.invitedBy, userId),
            inArray(schema.accountInvitations.status, ["pending", "accepted"]),
          ),
        )) as Array<{ total: number | string | null }>;
      const v = row?.total ?? 0;
      return typeof v === "string" ? Number(v) : v;
    }

    case "interview_sessions_monthly": {
      // Read from the authoritative interview_sessions table so sessions
      // that pre-date ledger metering still count.
      const [row] = (await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.interviewSessions)
        .where(
          and(
            eq(schema.interviewSessions.userId, userId),
            gte(schema.interviewSessions.createdAt, periodStart),
          ),
        )) as Array<{ total: number | string | null }>;
      const v = row?.total ?? 0;
      return typeof v === "string" ? Number(v) : v;
    }

    case "published_video_projects_lifetime": {
      // Count distinct studio_projects the user has a non-failed published
      // videos row against. Re-uploads to the same project replace the
      // existing video and don't count as new publishes.
      const [row] = (await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.studioProjects)
        .where(
          and(
            eq(schema.studioProjects.userId, userId),
            isNotNull(schema.studioProjects.videoId),
          ),
        )) as Array<{ total: number | string | null }>;
      const v = row?.total ?? 0;
      return typeof v === "string" ? Number(v) : v;
    }

    case "connected_inboxes_active": {
      // Snapshot count of `external_email_accounts` rows with `status =
      // 'active'`. Disconnecting a mailbox frees the slot immediately, so
      // periodStart is intentionally ignored.
      const [row] = (await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.externalEmailAccounts)
        .where(
          and(
            eq(schema.externalEmailAccounts.userId, userId),
            eq(schema.externalEmailAccounts.status, "active"),
          ),
        )) as Array<{ total: number | string | null }>;
      const v = row?.total ?? 0;
      return typeof v === "string" ? Number(v) : v;
    }

    default: {
      const _exhaustive: never = source;
      void _exhaustive;
      return 0;
    }
  }
}

export const servicesProcessor: ServicesProcessor = {
  async gate({ user, eventType, quantity = 1 }) {
    const spec = getEntitlement(eventType);
    // Anonymous callers: only public surfaces should be metered. They pass
    // gating (the route handler is what decides whether to invoke gate()).
    if (!user?.sub) {
      return {
        allowed: true,
        reason: null,
        cap: 0,
        consumed: 0,
        remaining: 0,
        plan: "free",
      };
    }
    if (isAdminRole(user)) {
      return {
        allowed: true,
        reason: null,
        cap: 0,
        consumed: 0,
        remaining: Number.POSITIVE_INFINITY,
        plan: "pro",
      };
    }

    const plan = await resolvePlan(user.sub);
    const cap = spec.monthlyCap[plan];
    if (cap === 0) {
      // Catalog declares this dimension unlimited for the user's tier.
      return {
        allowed: true,
        reason: null,
        cap: 0,
        consumed: 0,
        remaining: Number.POSITIVE_INFINITY,
        plan,
      };
    }

    const period = startOfMonthUtc();
    const consumed = await consumedInPeriod(user.sub, eventType, period);
    const remaining = Math.max(0, cap - consumed);

    if (spec.gateBehavior === "soft") {
      return { allowed: true, reason: null, cap, consumed, remaining, plan };
    }

    const allowed = consumed + quantity <= cap;
    return {
      allowed,
      reason: allowed
        ? null
        : `${spec.label}: ${consumed}/${cap} ${spec.unit} used this period`,
      cap,
      consumed,
      remaining,
      plan,
    };
  },

  async meter({ userId, eventType, quantity = 1, metadata, plan, periodStart }) {
    // Resolve plan once so the ledger row is stable even if the user upgrades
    // mid-month. (Their *future* writes use the new plan; this write keeps the
    // tier it was on at the moment of consumption.)
    const resolvedPlan = plan ?? (await resolvePlan(userId));
    const db = getDb();
    await db.insert(schema.usageLedger).values({
      userId,
      eventType,
      plan: resolvedPlan,
      quantity,
      periodStart: periodStart ?? startOfMonthUtc(),
      metadata: metadata ?? null,
    });
  },

  async getStatement(userId, periodStart) {
    const period = periodStart ?? startOfMonthUtc();
    const periodEnd = endOfMonthUtc(period);
    const db = getDb();

    // If a closed statement already exists for the period, return it verbatim
    // — past months are immutable once the cron has rolled them over.
    const existing = await db
      .select()
      .from(schema.usageStatements)
      .where(
        and(
          eq(schema.usageStatements.userId, userId),
          eq(schema.usageStatements.periodStart, period),
        ),
      )
      .limit(1);

    if (existing[0] && existing[0].status === "closed") {
      return {
        id: existing[0].id,
        userId,
        periodStart: existing[0].periodStart.toISOString(),
        periodEnd: existing[0].periodEnd.toISOString(),
        plan: existing[0].plan as PlanTier,
        lines: (existing[0].lines as UsageStatementLine[]) ?? [],
        totalCents: existing[0].totalCents,
        currency: existing[0].currency,
        status: "closed",
      };
    }

    // Otherwise compute the live preview from the ledger.
    const plan = await resolvePlan(userId);
    const rows = await db
      .select({
        eventType: schema.usageLedger.eventType,
        total: sql<number>`COALESCE(SUM(${schema.usageLedger.quantity}), 0)`,
      })
      .from(schema.usageLedger)
      .where(
        and(
          eq(schema.usageLedger.userId, userId),
          gte(schema.usageLedger.periodStart, period),
          lt(schema.usageLedger.periodStart, periodEnd),
        ),
      )
      .groupBy(schema.usageLedger.eventType)
      .orderBy(asc(schema.usageLedger.eventType));

    const consumedByType = new Map<UsageEventType, number>();
    for (const r of rows) {
      const total = typeof r.total === "string" ? Number(r.total) : r.total;
      consumedByType.set(r.eventType as UsageEventType, total);
    }

    // Non-ledger dimensions (lifetime / snapshot) have to be counted from
    // their own authoritative table — the SUM-by-event-type ledger query
    // above returns zero for them. Dispatch via the catalog's
    // `consumedSource` so every dimension gets its number from one place
    // (the same dispatcher `gate()` uses).
    const visible = listEntitlements(plan);
    const nonLedgerCounts = await Promise.all(
      visible.map(async (spec) => {
        const source = spec.consumedSource ?? "ledger_monthly";
        if (source === "ledger_monthly") return null;
        return [spec.eventType, await consumedInPeriod(userId, spec.eventType, period)] as const;
      }),
    );
    for (const entry of nonLedgerCounts) {
      if (entry) consumedByType.set(entry[0], entry[1]);
    }

    const lines: UsageStatementLine[] = visible.map((spec) => {
      const consumed = consumedByType.get(spec.eventType) ?? 0;
      const cap = spec.monthlyCap[plan];
      const overage = cap > 0 ? Math.max(0, consumed - cap) : 0;
      const overageCents = overage * spec.overageCentsPerUnit;
      return {
        eventType: spec.eventType,
        label: spec.label,
        unit: spec.unit,
        includedQuantity: cap,
        consumedQuantity: consumed,
        overageQuantity: overage,
        overageCents,
      };
    });

    const totalCents = lines.reduce((sum, l) => sum + l.overageCents, 0);

    return {
      id: existing[0]?.id ?? null,
      userId,
      periodStart: period.toISOString(),
      periodEnd: periodEnd.toISOString(),
      plan,
      lines,
      totalCents,
      currency: "USD",
      status: "open",
    };
  },

  async enforce(c, eventType, quantity = 1) {
    const gate = await this.gate({ user: c.var.user, eventType, quantity });
    if (gate.allowed) return null;
    const spec = getEntitlement(eventType);
    return c.json(
      {
        success: false,
        error: {
          code: "ENTITLEMENT_EXCEEDED",
          message: gate.reason ?? `${spec.label} limited to ${gate.cap} on the Free plan`,
          upgradeUrl: UPGRADE_URL,
          cap: gate.cap,
          consumed: gate.consumed,
          eventType,
        },
      },
      402,
    );
  },

  meterEvent(c, eventType, metadata, quantity = 1) {
    const userId = c.var.user?.sub;
    if (!userId) return;
    void this.meter({ userId, eventType, quantity, metadata }).catch((err) =>
      console.warn(`[services-processor] meter ${eventType} failed:`, err),
    );
  },
};

/** Helper that route handlers call — throws on hard-cap exhaustion. */
export async function requireEntitlement(args: GateArgs): Promise<GateResult> {
  const result = await servicesProcessor.gate(args);
  if (!result.allowed) {
    const spec = ENTITLEMENT_CATALOG[args.eventType];
    throw new EntitlementExceededError(args.eventType, spec.monthlyCap[result.plan], result.consumed);
  }
  return result;
}
