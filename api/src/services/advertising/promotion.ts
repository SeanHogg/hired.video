/**
 * Self-serve promotion writes that carry a content target (#176):
 * job boosts and ad creatives. (Company boosts are read-only here — the
 * unpaid create/list endpoints were removed 2026-10-17; paid promotion of
 * any subject goes through POST /api/checkout {kind:"boost"}.)
 *
 *   - Every write stamps the polymorphic pair through adSubjectColumns()
 *     (and therefore still writes job_id / company_id for those targets).
 *   - Every read resolves the target through resolveAdContentTarget().
 *   - Every boost prices through computeBoostPricing() (#1764).
 *
 * Routes (routes/advertising.ts) call these; table access lives in
 * AdPromotionRepository.
 */

import { getDb } from "../../db/index.js";
import {
  AdPromotionRepository,
  type AdRow,
  type JobBoostRow,
  type NewAdRow,
} from "../../repositories/adPromotionRepository.js";
import type { AdContentTarget } from "../../../../shared/ad-content-target.js";
import { adSubjectColumns, resolveAdContentTarget } from "./content-target.js";
import { computeBoostPricing, type BoostPricingModel } from "./pricing.js";
import { costPerClick, ctr } from "./metrics.js";

export type PromotionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "NOT_FOUND"; message: string };

function repoOf(repo?: AdPromotionRepository): AdPromotionRepository {
  return repo ?? new AdPromotionRepository(getDb());
}

// ─── Job boosts ───────────────────────────────────────────────────────────

export interface CreateJobBoostInput {
  jobId: string;
  placementType: string;
  pricingModel: Extract<BoostPricingModel, "cpm" | "cpc">;
  budgetCents: number;
  durationDays: number;
}

export async function createJobBoost(
  userId: string,
  input: CreateJobBoostInput,
  repo?: AdPromotionRepository,
): Promise<PromotionResult<JobBoostRow>> {
  const r = repoOf(repo);
  if (!(await r.isJobPostedBy(input.jobId, userId))) {
    return { ok: false, code: "NOT_FOUND", message: "Job not found or not owned by you" };
  }
  const pricing = computeBoostPricing(input);
  const target = adSubjectColumns({ subjectType: "job", subjectId: input.jobId });
  const boost = await r.insertJobBoost({
    jobId: input.jobId,
    subjectType: target.subjectType,
    subjectId: target.subjectId,
    userId,
    placementType: input.placementType,
    pricingModel: input.pricingModel,
    budgetCents: pricing.totalCents,
    rateUnitCents: pricing.rateUnitCents,
    startsAt: pricing.startsAt,
    endsAt: pricing.endsAt,
  });
  await r.markJobSponsored(input.jobId, pricing.endsAt);
  return { ok: true, value: boost };
}

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
