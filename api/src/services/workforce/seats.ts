/** Workforce seat billing (#1409, #1678) — seat reconciliation, commitment + authorized ceiling. */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { SEAT_PRICE_CENTS } from "../../../../shared/pricing.js";

const { userCompanyRoleAssociations, companySubscriptions, accountInvitations, billingEvents } = schema;

/** Universal seat price per `[[project_pricing_seats]]` — $9.95/mo. Canonical
 *  value lives in shared/pricing.ts `SEAT_PRICE_CENTS`; aliased here so the
 *  existing call sites stay terse. The companySubscriptions.pricePerSeatCents
 *  column default was realigned from the stale 4900¢ to SEAT_PRICE_CENTS in
 *  migration 0320; workforce rows still stamp 995¢ explicitly at create time. */
const WORKFORCE_SEAT_PRICE_CENTS = SEAT_PRICE_CENTS;

// ---------------------------------------------------------------------------
// Seat billing (#1409) — workforce seat reconciliation
//
// Each active employee in an employer's workspace is one $9.95/mo seat.
// `recalculateWorkforceSeats` is the single SSoT for seat-count → billing
// reconciliation; both invite-accept and employee-deactivate route through it
// so the company_subscriptions.seat_count stays in sync with the live UCRA
// table. Provider-side sync (calling Helcim to update the subscription
// charge amount) is deferred — see sub-gap noted in #1409.
// ---------------------------------------------------------------------------

export interface RecalculateSeatsResult {
  companyId: string;
  previousSeatCount: number;
  newSeatCount: number;
  pricePerSeatCents: number;
  totalMonthlyCents: number;
  delta: number;
}

export async function recalculateWorkforceSeats(
  companyId: string,
  db = getDb(),
): Promise<RecalculateSeatsResult> {
  // 1. Count active employees in the workspace — the canonical seat count.
  const activeEmployees = await db
    .select({ userId: userCompanyRoleAssociations.userId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.companyId, companyId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  const newSeatCount = activeEmployees.length;

  // 2. Upsert the companySubscriptions row. Workforce billing rides on the
  //    same per-company subscription as other team features — if the row
  //    doesn't exist (employer never bought anything else), create one
  //    stamped with the workforce seat price.
  const [existing] = await db.select().from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1);

  let previousSeatCount = 0;
  let row;
  const now = new Date();
  if (existing) {
    previousSeatCount = existing.seatCount;
    [row] = await db.update(companySubscriptions).set({
      seatCount: newSeatCount,
      // Don't clobber a custom price the employer negotiated; only stamp
      // the workforce default when there's nothing set yet.
      pricePerSeatCents: existing.pricePerSeatCents > 0
        ? existing.pricePerSeatCents
        : WORKFORCE_SEAT_PRICE_CENTS,
      updatedAt: now,
    } as any).where(eq(companySubscriptions.id, existing.id)).returning();
  } else {
    [row] = await db.insert(companySubscriptions).values({
      companyId,
      planTier: "workforce",
      seatCount: newSeatCount,
      pricePerSeatCents: WORKFORCE_SEAT_PRICE_CENTS,
      status: "active",
      billingInterval: "monthly",
    } as any).returning();
  }

  // 3. Audit trail + outbound provider sync. Pushing the new charge
  //    amount to Helcim recurring billing closes #1437 — the local row
  //    is canonical, but the provider needs to see the new amount on the
  //    next billing cycle. Stripe customer IDs vs Helcim subscription IDs
  //    both live on the legacy `stripeSubscriptionId` column today.
  const delta = newSeatCount - previousSeatCount;
  const totalMonthlyCents = newSeatCount * row!.pricePerSeatCents;

  let providerSync: { ok: boolean; providerRef?: string; error?: string } = { ok: true };
  if (delta !== 0) {
    try {
      const { HelcimWorkforceConnector } = await import("./connectors/helcim-billing.js");
      const connector = new HelcimWorkforceConnector();
      providerSync = await connector.syncRecurringAmount({
        helcimSubscriptionId: row!.stripeSubscriptionId ?? null,
        totalMonthlyAmountCents: totalMonthlyCents,
        currency: "USD",
      });
    } catch (e) {
      providerSync = { ok: false, error: String((e as Error).message) };
    }
  }

  await db.insert(billingEvents).values({
    eventType: "workforce_seats_recalculated",
    companyId,
    payload: {
      companyId,
      previousSeatCount,
      newSeatCount,
      pricePerSeatCents: row!.pricePerSeatCents,
      totalMonthlyCents,
      delta,
      providerSync,
      at: now.toISOString(),
    },
  } as any);

  return {
    companyId,
    previousSeatCount,
    newSeatCount,
    pricePerSeatCents: row!.pricePerSeatCents,
    totalMonthlyCents,
    delta,
  };
}

export interface SeatCommitment {
  /** Active employee memberships + pending employee invites — the seats the
   *  company is already on the hook for. */
  committedSeats: number;
  /** Authorized paid-seat ceiling the owner has explicitly agreed to. New
   *  seats beyond this require owner confirmation (gap #1678). */
  seatLimit: number;
  pricePerSeatCents: number;
}

/** Count the seats a company has already committed to: active `employee`
 *  UCRAs + still-pending `employee` invitations. Used by the seat soft-cap
 *  to decide whether a new employee invite needs owner confirmation. */
export async function getSeatCommitment(companyId: string, db = getDb()): Promise<SeatCommitment> {
  const activeEmployees = await db
    .select({ id: userCompanyRoleAssociations.id })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.companyId, companyId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  const pendingInvites = await db
    .select({ id: accountInvitations.id })
    .from(accountInvitations)
    .where(and(
      eq(accountInvitations.companyId, companyId),
      eq(accountInvitations.role, "employee"),
      eq(accountInvitations.status, "pending"),
    ));
  const [sub] = await db
    .select({ seatLimit: companySubscriptions.seatLimit })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1);
  return {
    committedSeats: activeEmployees.length + pendingInvites.length,
    seatLimit: sub?.seatLimit ?? 0,
    pricePerSeatCents: SEAT_PRICE_CENTS,
  };
}

/** Raise a company's authorized paid-seat ceiling to `newLimit` (never lowers
 *  it — that happens implicitly as seats free up). Upserts the
 *  company_subscriptions row with workforce defaults if it doesn't exist yet,
 *  so a brand-new workspace can authorize its first seat (gap #1678). */
export async function authorizeSeats(companyId: string, newLimit: number, db = getDb()): Promise<void> {
  const [existing] = await db
    .select({ id: companySubscriptions.id, seatLimit: companySubscriptions.seatLimit })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1);
  if (existing) {
    if (newLimit <= existing.seatLimit) return;
    await db.update(companySubscriptions)
      .set({ seatLimit: newLimit, updatedAt: new Date() } as any)
      .where(eq(companySubscriptions.id, existing.id));
  } else {
    await db.insert(companySubscriptions).values({
      companyId,
      planTier: "workforce",
      seatCount: 0,
      seatLimit: newLimit,
      pricePerSeatCents: WORKFORCE_SEAT_PRICE_CENTS,
      status: "active",
      billingInterval: "monthly",
    } as any);
  }
}
