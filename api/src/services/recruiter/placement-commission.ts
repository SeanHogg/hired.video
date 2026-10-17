/**
 * Placement commission use cases — split-aware commission summary (#228),
 * replace-all commission splits (#228) and per-placement stage-event
 * notification subscriptions (#230). All owner-scoped: only the
 * placement's recruiter reads/writes its splits and subscriptions.
 * Route: routes/recruiter/placements.ts + placement-notifications.ts.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  buildPlacementNotificationService,
  isPlacementEvent,
  type PlacementEvent,
} from "../notifications/placement-notifications.js";
import { normalizeOwnerType, recruiterShareForPlacement, validateSplits, type SplitShareRow } from "./placement-splits.js";
import {
  findPlacementIdsWithSplits,
  listOwnedCommissionRows,
  listSplitCommissionRowsForOwner,
  listSplitsForPlacement,
  ownsPlacement,
  replaceSplits,
  type PlacementSplitView,
} from "../../repositories/placementsRepository.js";

// ── Commission summary ──────────────────────────────────────────────────────

/** Counts stay owner-based ("placements I made"); EARNINGS are split-aware:
 *  a placement with splits pays each owner their bps share, one without
 *  pays its owner the full fee (no double-counting). */
export async function getCommissionSummary(userId: string) {
  const owned = await listOwnedCommissionRows(userId);
  const mySplitPlacements = await listSplitCommissionRowsForOwner(userId);
  const splitPlacementIds = await findPlacementIdsWithSplits(owned.map((r) => r.id));

  const splitsByPlacement = new Map<string, SplitShareRow[]>();
  for (const r of mySplitPlacements) {
    const arr = splitsByPlacement.get(r.id) ?? [];
    arr.push({ ownerUserId: r.ownerUserId, percentBps: r.percentBps });
    splitsByPlacement.set(r.id, arr);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let totalEarned = 0, totalPending = 0, totalPaid = 0;
  let placementsThisMonth = 0, placementsThisYear = 0;
  const addEarning = (amount: number, status: string) => {
    totalEarned += amount;
    if (status === "paid") totalPaid += amount;
    else totalPending += amount;
  };

  // Owned placements WITHOUT splits → full fee to me. (Counts use all owned.)
  for (const r of owned) {
    if (!splitPlacementIds.has(r.id)) addEarning(Number(r.commissionAmount) || 0, r.commissionStatus);
    if (r.createdAt >= startOfMonth) placementsThisMonth++;
    if (r.createdAt >= startOfYear) placementsThisYear++;
  }
  // Placements I'm split into (owned or not) → my bps share.
  for (const r of mySplitPlacements) {
    const share = recruiterShareForPlacement({
      placementId: r.id,
      ownerRecruiterId: r.recruiterId,
      commissionAmount: Number(r.commissionAmount) || 0,
      viewerUserId: userId,
      splitsByPlacement,
    });
    addEarning(share, r.commissionStatus);
  }

  return {
    totalEarned,
    totalPending,
    totalPaid,
    totalPlacements: owned.length,
    placementsThisMonth,
    placementsThisYear,
    averagePlacementValue: owned.length > 0 ? totalEarned / owned.length : 0,
  };
}

// ── Splits ──────────────────────────────────────────────────────────────────

export const SplitsBodySchema = z.object({
  splits: z.array(
    z.object({
      ownerUserId: UuidLikeSchema,
      ownerType: z.string().max(24).optional(),
      percentBps: z.number().int().min(1).max(10_000),
    }),
  ).max(20),
});

/** Split rows for an owned placement; null when not the caller's. */
export async function getPlacementSplits(recruiterId: string, placementId: string): Promise<PlacementSplitView[] | null> {
  if (!(await ownsPlacement(recruiterId, placementId))) return null;
  return listSplitsForPlacement(placementId);
}

/** Replace-all the split set. Empty clears (owner takes the full fee);
 *  non-empty must total 100%. Null when not the caller's placement. */
export async function replacePlacementSplits(
  recruiterId: string,
  placementId: string,
  rawBody: unknown,
): Promise<PlacementSplitView[] | null> {
  if (!(await ownsPlacement(recruiterId, placementId))) return null;

  const parsed = SplitsBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid splits", parsed.error.flatten());
  }
  const splits = parsed.data.splits.map((s) => ({
    ownerUserId: s.ownerUserId,
    ownerType: normalizeOwnerType(s.ownerType),
    percentBps: s.percentBps,
  }));
  const valid = validateSplits(splits);
  if (!valid.ok) throw new DomainError(400, "VALIDATION_ERROR", valid.reason);

  await replaceSplits(placementId, splits);
  return listSplitsForPlacement(placementId);
}

// ── Notification subscriptions (#230) ───────────────────────────────────────

function assertPlacementEvent(event: unknown): asserts event is PlacementEvent {
  if (!isPlacementEvent(event)) throw new DomainError(400, "VALIDATION_ERROR", "Unknown placement event");
}

/** The caller's own subscriptions; null when not the caller's placement. */
export async function listMyPlacementSubscriptions(recruiterId: string, placementId: string) {
  if (!(await ownsPlacement(recruiterId, placementId))) return null;
  const subs = await buildPlacementNotificationService(getDb()).listForPlacement(placementId);
  return subs.filter((s) => s.userId === recruiterId);
}

export async function subscribeToPlacementEvent(recruiterId: string, placementId: string, event: unknown) {
  assertPlacementEvent(event);
  if (!(await ownsPlacement(recruiterId, placementId))) return null;
  await buildPlacementNotificationService(getDb()).subscribe(placementId, recruiterId, event);
  return { subscribed: true, event };
}

export async function unsubscribeFromPlacementEvent(recruiterId: string, placementId: string, event: string) {
  assertPlacementEvent(event);
  if (!(await ownsPlacement(recruiterId, placementId))) return null;
  await buildPlacementNotificationService(getDb()).unsubscribe(placementId, recruiterId, event);
  return { unsubscribed: true, event };
}
