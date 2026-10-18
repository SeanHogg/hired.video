/**
 * Coupon use cases — SuperAdmin issues codes, users redeem them for a
 * time-boxed Pro comp (migration 0500, shared/coupons.ts).
 *
 * The grant is written to `user_plan_overrides` (plan_slug = "pro",
 * expires_at = end of comp), which every Pro gate already resolves through,
 * so résumé tailoring, AI cover letters, video publishing, promotion and the
 * Pro token budget all unlock with no per-feature wiring.
 *
 * Throws a typed `CouponError(kind)`; routes/coupon-errors.ts maps it to HTTP.
 */
import {
  COUPON_GRANT_PLAN,
  canRedeemCoupon,
  type CouponDTO,
  type CouponErrorKind,
  type CouponRedemptionDTO,
  type CreateCouponInput,
  type RedeemCouponResultDTO,
  type UpdateCouponInput,
} from "../../../../shared/coupons.js";
import type { SubscriptionSummaryDTO } from "../../../../shared/billing.js";
import type { PlanOverrideInsert, PlanOverrideRow } from "../../repositories/index.js";
import { AUDIT_ACTIONS, type AuditAction } from "../../utils/audit.js";
import * as couponRepo from "./couponRepository.js";
import type { CouponRow } from "./couponRepository.js";
import { DomainError } from "../../domains/errors.js";

/** CouponError → HTTP status (the global error handler renders it). */
const COUPON_ERROR_STATUS: Record<CouponErrorKind, 403 | 404 | 409 | 410> = {
  INVALID_CODE: 404,
  NOT_FOUND: 404,
  EXPIRED: 410,
  EXHAUSTED: 410,
  ALREADY_REDEEMED: 409,
  ALREADY_PRO: 409,
  ACCOUNT_REQUIRED: 403,
  CODE_TAKEN: 409,
};

export class CouponError extends DomainError {
  constructor(public readonly kind: CouponErrorKind, message: string) {
    super(COUPON_ERROR_STATUS[kind], kind, message);
    this.name = "CouponError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── ports ──────────────────────────────────────────────────────────────────

export type CouponRepoPort = Pick<
  typeof couponRepo,
  | "insertCoupon"
  | "listCoupons"
  | "findCouponByCode"
  | "updateCoupon"
  | "claimRedemptionSlot"
  | "releaseRedemptionSlot"
  | "hasRedeemed"
  | "insertRedemption"
  | "deleteRedemption"
  | "listRedemptions"
>;

/** The plan-override aggregate the grant is written to. */
export interface PlanGrantPort {
  findOverrideByUserId(userId: string): Promise<PlanOverrideRow | null>;
  upsertOverride(input: PlanOverrideInsert): Promise<PlanOverrideRow>;
  /** The user's current plan as every Pro gate sees it. */
  getSubscription(userId: string): Promise<SubscriptionSummaryDTO>;
  /** Bust the effective-plan cache so the grant shows on the next request. */
  invalidateForUser(userId: string): void;
}

export interface CouponAuditPort {
  log(entry: { actorId: string; action: AuditAction; targetType: string; targetId: string; metadata: Record<string, unknown> }): Promise<void>;
}

export interface CouponDeps {
  coupons: CouponRepoPort;
  plans: PlanGrantPort;
  audit: CouponAuditPort;
  now: () => Date;
  /** Random code generator — injected so tests are deterministic. */
  generateCode: () => string;
}

// ── mapping ────────────────────────────────────────────────────────────────

export function toCouponDTO(row: CouponRow): CouponDTO {
  return {
    id: row.id,
    code: row.code,
    durationDays: row.durationDays,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isActive: row.isActive,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── SuperAdmin ─────────────────────────────────────────────────────────────

/** Attempts at a fresh generated code before giving up on collisions. */
const GENERATE_ATTEMPTS = 5;

export async function createCoupon(
  deps: CouponDeps,
  input: CreateCouponInput & { actorId: string },
): Promise<CouponDTO> {
  const base = {
    durationDays: input.durationDays,
    maxRedemptions: input.maxRedemptions,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    note: input.note,
    createdBy: input.actorId,
  };
  let created: CouponRow | null = null;
  if (input.code) {
    created = await deps.coupons.insertCoupon({ ...base, code: input.code });
    if (!created) throw new CouponError("CODE_TAKEN", "That code already exists");
  } else {
    for (let i = 0; i < GENERATE_ATTEMPTS && !created; i++) {
      created = await deps.coupons.insertCoupon({ ...base, code: deps.generateCode() });
    }
    if (!created) throw new CouponError("CODE_TAKEN", "Could not generate a unique code");
  }
  await deps.audit.log({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.COUPON_CREATED,
    targetType: "coupon",
    targetId: created.id,
    metadata: { code: created.code, durationDays: created.durationDays, maxRedemptions: created.maxRedemptions },
  });
  return toCouponDTO(created);
}

export async function listCoupons(deps: CouponDeps): Promise<CouponDTO[]> {
  return (await deps.coupons.listCoupons()).map(toCouponDTO);
}

export async function updateCoupon(
  deps: CouponDeps,
  input: { id: string; actorId: string; patch: UpdateCouponInput },
): Promise<CouponDTO> {
  const { expiresAt, ...rest } = input.patch;
  const updated = await deps.coupons.updateCoupon(input.id, {
    ...rest,
    ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
  });
  if (!updated) throw new CouponError("NOT_FOUND", "Coupon not found");
  await deps.audit.log({
    actorId: input.actorId,
    action: AUDIT_ACTIONS.COUPON_UPDATED,
    targetType: "coupon",
    targetId: updated.id,
    metadata: { code: updated.code, patch: input.patch },
  });
  return toCouponDTO(updated);
}

export async function listRedemptions(deps: CouponDeps, couponId: string): Promise<CouponRedemptionDTO[]> {
  const rows = await deps.coupons.listRedemptions(couponId);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    email: r.email,
    name: r.name,
    grantedUntil: r.grantedUntil.toISOString(),
    redeemedAt: r.redeemedAt.toISOString(),
  }));
}

// ── user ───────────────────────────────────────────────────────────────────

/**
 * Redeem `code` for `userId`. Stacks onto an active comp (a second code
 * extends from the current end, never resets it). Refuses users already on
 * Pro through a paid subscription, trial, staff role or a permanent comp —
 * the code would grant them nothing.
 */
export async function redeemCoupon(
  deps: CouponDeps,
  input: { userId: string; isGuest: boolean; code: string },
): Promise<RedeemCouponResultDTO> {
  // A comp on a throwaway guest account would be lost on sign-up.
  if (input.isGuest) throw new CouponError("ACCOUNT_REQUIRED", "Create a free account to redeem a code");
  const now = deps.now();
  const coupon = await deps.coupons.findCouponByCode(input.code);
  if (!coupon || !coupon.isActive) throw new CouponError("INVALID_CODE", "That code isn't valid");
  if (coupon.expiresAt && coupon.expiresAt <= now) throw new CouponError("EXPIRED", "That code has expired");
  if (await deps.coupons.hasRedeemed(coupon.id, input.userId)) {
    throw new CouponError("ALREADY_REDEEMED", "You've already redeemed this code");
  }

  const plan = await deps.plans.getSubscription(input.userId);
  if (!canRedeemCoupon(plan)) {
    throw new CouponError("ALREADY_PRO", "You already have Pro");
  }

  if (!(await deps.coupons.claimRedemptionSlot(coupon.id, now))) {
    throw new CouponError("EXHAUSTED", "That code has been fully redeemed");
  }

  const existing = await deps.plans.findOverrideByUserId(input.userId);
  const existingActive = existing && (!existing.expiresAt || existing.expiresAt > now) ? existing : null;
  const currentEnd = plan.compedUntil ? new Date(plan.compedUntil) : now;
  const from = currentEnd > now ? currentEnd : now;
  const grantedUntil = new Date(from.getTime() + coupon.durationDays * DAY_MS);

  const redemption = await deps.coupons.insertRedemption({ couponId: coupon.id, userId: input.userId, grantedUntil });
  if (!redemption) {
    await deps.coupons.releaseRedemptionSlot(coupon.id);
    throw new CouponError("ALREADY_REDEEMED", "You've already redeemed this code");
  }

  try {
    await deps.plans.upsertOverride({
      userId: input.userId,
      planSlug: COUPON_GRANT_PLAN,
      // Keep a SuperAdmin-set token cap if one exists.
      monthlyTokenLimit: existingActive?.monthlyTokenLimit ?? null,
      expiresAt: grantedUntil,
      reason: `Coupon ${coupon.code}`,
      // Creator deleted → attribute to the redeemer (column is NOT NULL).
      grantedBy: coupon.createdBy ?? input.userId,
    });
  } catch (err) {
    // No interactive transactions on neon-http: undo the redemption so the
    // user can retry and the cap stays accurate.
    await deps.coupons.deleteRedemption(redemption.id).catch(() => undefined);
    await deps.coupons.releaseRedemptionSlot(coupon.id).catch(() => undefined);
    throw err;
  }
  deps.plans.invalidateForUser(input.userId);

  await deps.audit.log({
    actorId: input.userId,
    action: AUDIT_ACTIONS.COUPON_REDEEMED,
    targetType: "coupon",
    targetId: coupon.id,
    metadata: { code: coupon.code, grantedUntil: grantedUntil.toISOString() },
  });

  return { code: coupon.code, durationDays: coupon.durationDays, grantedUntil: grantedUntil.toISOString() };
}
