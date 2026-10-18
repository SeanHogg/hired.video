/**
 * Self-serve promotion reads/writes that carry a content target (#176):
 * job boost listing and ad creatives. Job boosts are CREATED only through
 * the paid checkout (POST /api/checkout {kind:"job_boost"} —
 * services/billing/checkout/kinds/jobBoost.ts). (Company boosts are read-only here — the
 * unpaid create/list endpoints were removed 2026-10-17; paid promotion of
 * any subject goes through POST /api/checkout {kind:"boost"}.)
 *
 *   - Every write stamps the polymorphic pair through adSubjectColumns()
 *     (and therefore still writes job_id / company_id for those targets).
 *   - Every read resolves the target through resolveAdContentTarget().
 *
 * Routes (routes/advertising.ts) call these; table access lives in
 * AdPromotionRepository.
 */

import { getDb } from "../../db/index.js";
import {
  AdPromotionRepository,
  type AdRow,
  type NewAdRow,
  type ServableAd,
} from "../../repositories/adPromotionRepository.js";
import type { AdContentTarget } from "../../../../shared/ad-content-target.js";
import { adSubjectColumns, resolveAdContentTarget } from "./content-target.js";
import { costPerClick, ctr } from "./metrics.js";
import { placementsForSlot } from "./slot-placements.js";

export type PromotionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "NOT_FOUND"; message: string };

function repoOf(repo?: AdPromotionRepository): AdPromotionRepository {
  return repo ?? new AdPromotionRepository(getDb());
}

// ─── Job boosts ───────────────────────────────────────────────────────────

export async function listJobBoosts(userId: string, repo?: AdPromotionRepository) {
  const r = repoOf(repo);
  const rows = await r.listJobBoostsForUser(userId);
  const targets = rows.map((b) => resolveAdContentTarget(b));
  const titles = await r.jobTitlesByIds([
    ...new Set(targets.filter((t): t is AdContentTarget => t?.subjectType === "job").map((t) => t.subjectId)),
  ]);
  return rows.map((b, i) => {
    const target = targets[i];
    return {
      ...b,
      target,
      jobTitle: (target && titles.get(target.subjectId)) ?? "Unknown Job",
      budgetDollars: b.budgetCents / 100,
      spentDollars: b.spentCents / 100,
      ctr: ctr(b.impressions, b.clicks),
      costPerClick: costPerClick(b.spentCents, b.clicks),
    };
  });
}

/** Owner-scoped pause (active → paused) / resume (paused → active); null when no such boost in `from`. */
export async function transitionJobBoost(
  userId: string,
  boostId: string,
  from: "active" | "paused",
  to: "active" | "paused",
  repo?: AdPromotionRepository,
) {
  return repoOf(repo).transitionJobBoostStatus(boostId, userId, from, to);
}

/** Cancel the owner's boost and unsponsor its job; false when not found. */
export async function cancelJobBoost(userId: string, boostId: string, repo?: AdPromotionRepository): Promise<boolean> {
  const r = repoOf(repo);
  const boost = await r.findJobBoostForOwner(boostId, userId);
  if (!boost) return false;
  await r.setJobBoostStatus(boost.id, "cancelled");
  await r.unsponsorJob(boost.jobId);
  return true;
}

// ─── Company boosts ───────────────────────────────────────────────────────

// ─── Ad creatives ─────────────────────────────────────────────────────────

/** Creative fields accepted from the client (validated by the route). */
export type AdCreativeFields = Omit<
  NewAdRow,
  "id" | "adSetId" | "userId" | "subjectType" | "subjectId" | "impressions" | "clicks" | "createdAt" | "updatedAt"
>;

/** `target` undefined = leave unchanged (update) / none (create);
 *  null = clear it. */
export interface AdWriteInput {
  fields: Partial<AdCreativeFields>;
  target?: AdContentTarget | null;
}

function targetColumns(target: AdContentTarget | null | undefined): Partial<NewAdRow> {
  if (target === undefined) return {};
  if (target === null) return { subjectType: null, subjectId: null };
  const cols = adSubjectColumns(target);
  return { subjectType: cols.subjectType, subjectId: cols.subjectId };
}

function withTarget(ad: AdRow) {
  return { ...ad, target: resolveAdContentTarget(ad), ctr: ctr(ad.impressions, ad.clicks) };
}

export async function createAd(
  userId: string,
  adSetId: string,
  input: AdWriteInput & { fields: AdCreativeFields },
  repo?: AdPromotionRepository,
): Promise<PromotionResult<ReturnType<typeof withTarget>>> {
  const r = repoOf(repo);
  if (!(await r.isAdSetOwnedBy(adSetId, userId))) {
    return { ok: false, code: "NOT_FOUND", message: "Ad set not found" };
  }
  const ad = await r.insertAd({ ...input.fields, ...targetColumns(input.target), adSetId, userId });
  return { ok: true, value: withTarget(ad) };
}

export async function updateAd(
  userId: string,
  adId: string,
  input: AdWriteInput,
  repo?: AdPromotionRepository,
): Promise<PromotionResult<ReturnType<typeof withTarget>>> {
  const ad = await repoOf(repo).updateAdForOwner(adId, userId, { ...input.fields, ...targetColumns(input.target) });
  if (!ad) return { ok: false, code: "NOT_FOUND", message: "Ad not found" };
  return { ok: true, value: withTarget(ad) };
}

/** Delete the owner's ad; false when not found / not theirs. */
export async function deleteAd(userId: string, adId: string, repo?: AdPromotionRepository): Promise<boolean> {
  return repoOf(repo).deleteAdForOwner(adId, userId);
}

/**
 * #2396 — one active internal creative for a named page slot, counting the
 * impression. Not owner-filtered: ads are shown TO the viewer.
 */
export async function serveAdForSlot(
  slot: string,
  repo?: Pick<AdPromotionRepository, "serveAdImpression">,
): Promise<ServableAd | null> {
  // Pick + count in one statement (repository).
  return (repo ?? repoOf()).serveAdImpression([...placementsForSlot(slot)]);
}

export async function listAds(
  userId: string,
  adSetId: string,
  repo?: AdPromotionRepository,
): Promise<PromotionResult<Array<ReturnType<typeof withTarget>>>> {
  const r = repoOf(repo);
  if (!(await r.isAdSetOwnedBy(adSetId, userId))) {
    return { ok: false, code: "NOT_FOUND", message: "Ad set not found" };
  }
  const rows = await r.listAdsForAdSet(adSetId);
  return { ok: true, value: rows.map(withTarget) };
}
