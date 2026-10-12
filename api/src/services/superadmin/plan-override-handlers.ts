/**
 * Pure handlers for SuperAdmin plan overrides.
 *
 * Two operations:
 *   • handleSetPlanOverride   — upsert a per-user override (plan, token
 *                               limit, trial window, reason).
 *   • handleClearPlanOverride — delete the row; user reverts to their
 *                               real subscription.
 *
 * Both handlers are pure with respect to `PlanOverrideDeps` — no calls
 * to `getDb()`, `new Date()`, or `auditLog()` inside. Tests pass fake
 * deps and assert on DB state + audit calls. The Hono route is a
 * thin adapter (see superadmin/users.ts).
 *
 * Validation lives here (not in the route) so misuse from other
 * callers — e.g. a future admin CLI — is rejected the same way.
 */

import { z } from "zod";

import { AUDIT_ACTIONS, type AuditAction } from "../../utils/audit.js";
import {
  UNLIMITED_TOKEN_LIMIT,
  type PlanOverrideSnapshot,
} from "../../domains/planOverride/resolver.js";
import type { IUsersRepository, ISubscriptionsRepository } from "../../repositories/index.js";
import type { PlanUpgradeEmailParams } from "../adapters/email.js";

// ---------------------------------------------------------------------------
// Ports (Interface Segregation — one port per cross-cutting concern)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditPort {
  log(entry: AuditEntry): Promise<void>;
}

/** Effective-plan cache port. Override writes must bust the BillingService
 *  cache so the user-facing UI ("Upgrade Account" button, AI-tokens pill)
 *  reflects the new plan on the next request — without this, a 60s cache
 *  TTL hides the change from the user. Modeled as a port so tests don't
 *  reach into the billing module. */
export interface PlanCachePort {
  invalidateForUser(userId: string): void;
}

/** Email notification port. Fire-and-forget — a send failure must never
 *  roll back the override write. Tests pass a no-op spy. */
export interface EmailPort {
  sendPlanUpgrade(params: PlanUpgradeEmailParams): Promise<void>;
}

export interface PlanOverrideDeps {
  /** ISP — handlers only need the two repos that touch this aggregate.
   *  No db handle; Drizzle access belongs in the repo layer. */
  users: IUsersRepository;
  subscriptions: ISubscriptionsRepository;
  audit: AuditPort;
  cache: PlanCachePort;
  email: EmailPort;
  /** Injected clock so tests can freeze time. */
  now: () => Date;
}

// Result envelope lives in the shared handler module. This file doesn't
// use requireAuth because superadmin routes have their own Hono-level
// role guard upstream of the handler.
import { ok, fail, type HandlerResult } from "../../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

/** The set of plan slugs a SuperAdmin may grant via override. "admin" is
 *  not listed — internal status is decided by the role/is_super_admin
 *  flag, not by override. */
const OverridablePlanSlug = z.enum(["free", "pro", "unlimited"]);

export const SetPlanOverrideSchema = z
  .object({
    /** null → keep subscription plan; only adjust the token limit. */
    planSlug: OverridablePlanSlug.nullable().optional(),
    /** Monthly token cap override. null = use plan default; "unlimited"
     *  maps to the UNLIMITED_TOKEN_LIMIT sentinel in storage; otherwise a
     *  positive integer. Zero is intentionally rejected — use "suspend"
     *  for that. */
    monthlyTokenLimit: z
      .union([z.literal("unlimited"), z.number().int().min(1).max(1_000_000_000)])
      .nullable()
      .optional(),
    /** ISO-8601 datetime string. null = permanent override. */
    expiresAt: z.string().datetime().nullable().optional(),
    /** Required — every comp/override needs attribution. */
    reason: z.string().min(1, "reason is required").max(1000),
  })
  .refine(
    (v) =>
      v.planSlug !== undefined
      || v.monthlyTokenLimit !== undefined,
    { message: "Must specify at least one of planSlug or monthlyTokenLimit" },
  );

export type SetPlanOverrideInput = z.infer<typeof SetPlanOverrideSchema>;

// ---------------------------------------------------------------------------
// handleSetPlanOverride
// ---------------------------------------------------------------------------

/**
 * Upsert a plan override for a user. Creates the row if absent, replaces
 * the fields if present (granted_by + granted_at are refreshed on every
 * set so the timestamp in the UI reflects the latest change).
 *
 * Emits an ADMIN_OVERRIDE_SET audit entry with the *diff* — previous
 * values + new values — so the audit log tells the complete story of
 * how this user's plan changed over time.
 */
export async function handleSetPlanOverride(
  deps: PlanOverrideDeps,
  adminId: string,
  userId: string,
  body: unknown,
): Promise<HandlerResult> {
  const parsed = SetPlanOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  // 1. Verify the target user exists.
  const target = await deps.users.findById(userId);
  if (!target) {
    return fail(404, "NOT_FOUND", "User not found");
  }

  // 2. Load the existing override (may be null) so the audit entry can
  //    record the before/after.
  const existingRow = await deps.subscriptions.findOverrideByUserId(userId);
  const existing: PlanOverrideSnapshot | null = existingRow
    ? {
        planSlug: existingRow.planSlug ?? null,
        monthlyTokenLimit: existingRow.monthlyTokenLimit ?? null,
        expiresAt: existingRow.expiresAt ?? null,
        reason: existingRow.reason,
        grantedBy: existingRow.grantedBy,
        grantedAt: existingRow.grantedAt,
      }
    : null;

  // 3. Normalise the input into storage values.
  const storedMonthlyLimit =
    parsed.data.monthlyTokenLimit === undefined
      ? (existing?.monthlyTokenLimit ?? null)
      : parsed.data.monthlyTokenLimit === null
      ? null
      : parsed.data.monthlyTokenLimit === "unlimited"
      ? UNLIMITED_TOKEN_LIMIT
      : parsed.data.monthlyTokenLimit;

  const storedPlanSlug =
    parsed.data.planSlug === undefined
      ? (existing?.planSlug ?? null)
      : parsed.data.planSlug;

  const storedExpiresAt =
    parsed.data.expiresAt === undefined
      ? (existing?.expiresAt ?? null)
      : parsed.data.expiresAt === null
      ? null
      : new Date(parsed.data.expiresAt);

  // Guard: expiry in the past is almost certainly an operator error.
  if (storedExpiresAt && storedExpiresAt.getTime() <= deps.now().getTime()) {
    return fail(400, "VALIDATION_ERROR", "expiresAt must be in the future");
  }

  const now = deps.now();
  const row = {
    userId,
    planSlug: storedPlanSlug,
    monthlyTokenLimit: storedMonthlyLimit,
    expiresAt: storedExpiresAt,
    reason: parsed.data.reason,
    grantedBy: adminId,
    grantedAt: now,
    updatedAt: now,
  };

  // 4. Upsert via the repo — `upsertOverride` hides the Drizzle
  //    onConflictDoUpdate target from the handler.
  await deps.subscriptions.upsertOverride(row as any);

  // Bust the effective-plan cache so the user's next request resolves
  // against the new override instead of a stale snapshot.
  deps.cache.invalidateForUser(userId);

  // 5. Audit — record before/after so history is self-contained.
  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.ADMIN_OVERRIDE_SET,
    targetType: "user",
    targetId: userId,
    metadata: {
      from: existing
        ? {
            planSlug: existing.planSlug,
            monthlyTokenLimit: existing.monthlyTokenLimit,
            expiresAt: existing.expiresAt?.toISOString() ?? null,
            reason: existing.reason,
            grantedBy: existing.grantedBy,
          }
        : null,
      to: {
        planSlug: row.planSlug,
        monthlyTokenLimit: row.monthlyTokenLimit,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        reason: row.reason,
        grantedBy: row.grantedBy,
      },
    },
  });

  // 6. Notify the user — fire-and-forget so a send failure never rolls
  //    back the override. Only send when the plan is being set/changed to
  //    a paid tier (pro or unlimited); skip free downgrades and token-only
  //    adjustments with no plan change.
  const notifyPlan = row.planSlug ?? null;
  if (notifyPlan === "pro" || notifyPlan === "unlimited") {
    const planDisplayName = notifyPlan === "unlimited" ? "Unlimited" : "Pro";
    deps.email.sendPlanUpgrade({
      to: target.email,
      recipientName: target.name ?? target.email,
      planSlug: notifyPlan,
      planName: planDisplayName,
      monthlyTokenLimit: row.monthlyTokenLimit,
      expiresAt: row.expiresAt,
    }).catch((err) => {
      console.error("[plan-override] Failed to send upgrade email:", err);
    });
  }

  return ok({
    userId,
    planSlug: row.planSlug,
    monthlyTokenLimit: row.monthlyTokenLimit,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    reason: row.reason,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// handleClearPlanOverride
// ---------------------------------------------------------------------------

/**
 * Delete the override row. User reverts to their real subscription at
 * the plan's default limit on the next request.
 *
 * Emits ADMIN_OVERRIDE_CLEARED with the pre-delete snapshot so the audit
 * trail still shows what was active.
 */
export async function handleClearPlanOverride(
  deps: PlanOverrideDeps,
  adminId: string,
  userId: string,
): Promise<HandlerResult> {
  const target = await deps.users.findById(userId);
  if (!target) {
    return fail(404, "NOT_FOUND", "User not found");
  }

  const existing = await deps.subscriptions.findOverrideByUserId(userId);
  if (!existing) {
    // Idempotent — clearing an absent override is a no-op, not an error.
    return ok({ userId, cleared: false });
  }

  await deps.subscriptions.deleteOverrideByUserId(userId);

  // Bust the effective-plan cache so the user immediately reverts to the
  // subscription-derived plan instead of seeing the cleared override
  // hang around for the cache TTL.
  deps.cache.invalidateForUser(userId);

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.ADMIN_OVERRIDE_CLEARED,
    targetType: "user",
    targetId: userId,
    metadata: {
      clearedOverride: {
        planSlug: existing.planSlug ?? null,
        monthlyTokenLimit: existing.monthlyTokenLimit ?? null,
        expiresAt: existing.expiresAt?.toISOString?.() ?? null,
        reason: existing.reason,
        grantedBy: existing.grantedBy,
        grantedAt: existing.grantedAt?.toISOString?.() ?? null,
      },
    },
  });

  return ok({ userId, cleared: true });
}
