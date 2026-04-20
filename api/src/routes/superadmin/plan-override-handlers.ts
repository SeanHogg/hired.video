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

import { eq } from "drizzle-orm";
import { z } from "zod";

import { schema } from "../../db/index.js";
import { AUDIT_ACTIONS, type AuditAction } from "../../utils/audit.js";
import {
  UNLIMITED_TOKEN_LIMIT,
  type PlanOverrideSnapshot,
} from "../../domains/planOverride/resolver.js";

const { users, userPlanOverrides } = schema;

// ---------------------------------------------------------------------------
// Ports (Interface Segregation — one port per cross-cutting concern)
// ---------------------------------------------------------------------------

export type DbPort = any;

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

export interface PlanOverrideDeps {
  db: DbPort;
  audit: AuditPort;
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
  const targetRows = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!targetRows || targetRows.length === 0) {
    return fail(404, "NOT_FOUND", "User not found");
  }

  // 2. Load the existing override (may be null) so the audit entry can
  //    record the before/after.
  const existingRows = await deps.db
    .select()
    .from(userPlanOverrides)
    .where(eq(userPlanOverrides.userId, userId))
    .limit(1);
  const existing: PlanOverrideSnapshot | null = existingRows[0]
    ? {
        planSlug: existingRows[0].planSlug ?? null,
        monthlyTokenLimit: existingRows[0].monthlyTokenLimit ?? null,
        expiresAt: existingRows[0].expiresAt ?? null,
        reason: existingRows[0].reason,
        grantedBy: existingRows[0].grantedBy,
        grantedAt: existingRows[0].grantedAt,
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

  // 4. Upsert. Drizzle's `onConflictDoUpdate` keyed on the PK.
  await deps.db
    .insert(userPlanOverrides)
    .values(row)
    .onConflictDoUpdate({
      target: userPlanOverrides.userId,
      set: {
        planSlug: row.planSlug,
        monthlyTokenLimit: row.monthlyTokenLimit,
        expiresAt: row.expiresAt,
        reason: row.reason,
        grantedBy: row.grantedBy,
        grantedAt: row.grantedAt,
        updatedAt: row.updatedAt,
      },
    });

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
  const targetRows = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!targetRows || targetRows.length === 0) {
    return fail(404, "NOT_FOUND", "User not found");
  }

  const existingRows = await deps.db
    .select()
    .from(userPlanOverrides)
    .where(eq(userPlanOverrides.userId, userId))
    .limit(1);

  if (!existingRows[0]) {
    // Idempotent — clearing an absent override is a no-op, not an error.
    return ok({ userId, cleared: false });
  }

  const existing = existingRows[0];

  await deps.db
    .delete(userPlanOverrides)
    .where(eq(userPlanOverrides.userId, userId));

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
