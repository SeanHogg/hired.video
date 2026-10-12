/**
 * #977 — Microsoft Advertising (Bing) targeting criteria for one ad group
 * (Campaign Management API v13, REST/JSON). Every criterion is a
 * BiddableAdGroupCriterion with a BidMultiplier: 0 = target with no
 * adjustment, -100 = exclude.
 *
 *   geo     → LocationCriterion (BING_COUNTRY_LOCATION_IDS; numeric
 *             spec.geo.regions pass through as native location ids)
 *   age     → AgeCriterion       for each range inside [ageMin, ageMax]
 *   gender  → GenderCriterion    for each targeted gender
 *   device  → DeviceCriterion    for all three devices, -100 on untargeted
 *
 * Create: ONE AddAdGroupCriterions call. Update: read the existing
 * criterions (GetAdGroupCriterionsByIds), then ONE DeleteAdGroupCriterions
 * batch for the ones no longer wanted and ONE AddAdGroupCriterions batch
 * for the missing ones — the same delta model as the Google adapter.
 *
 * Docs: https://learn.microsoft.com/en-us/advertising/campaign-management-service/addadgroupcriterions
 *       https://learn.microsoft.com/en-us/advertising/campaign-management-service/getadgroupcriterionsbyids
 *       https://learn.microsoft.com/en-us/advertising/campaign-management-service/deleteadgroupcriterions
 */

import type { TargetingSpec } from "../../ports/types.js";
import {
  bucketsWithin,
  hasAgeBounds,
  numericRegionIds,
  targetedCountries,
  targetedDevices,
  targetedGenders,
  type AgeBucket,
} from "../../targeting.js";
import { BING_COUNTRY_LOCATION_IDS } from "./location-ids.js";

export const MS_CAMPAIGN_API = "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13";

const AGE_RANGES: ReadonlyArray<AgeBucket & { range: string }> = [
  { range: "EighteenToTwentyFour", min: 18, max: 24 },
  { range: "TwentyFiveToThirtyFour", min: 25, max: 34 },
  { range: "ThirtyFiveToFortyNine", min: 35, max: 49 },
  { range: "FiftyToSixtyFour", min: 50, max: 64 },
  { range: "SixtyFiveAndAbove", min: 65, max: Infinity },
];

const DEVICE_NAMES = { desktop: "Computers", mobile: "Smartphones", tablet: "Tablets" } as const;

type Criterion = Record<string, unknown>;

export interface BingCriteriaPlan {
  body: { AdGroupCriterions: Criterion[]; CriterionType: "Targets" } | null;
  skipped: string[];
}

function biddable(adGroupId: number, criterion: Criterion, multiplier = 0): Criterion {
  return {
    Type: "BiddableAdGroupCriterion",
    AdGroupId: adGroupId,
    Status: "Active",
    Criterion: criterion,
    CriterionBid: { Type: "BidMultiplier", Multiplier: multiplier },
  };
}

/** Stable identity of a criterion (type + value + multiplier). */
export function bingCriterionKey(item: { Criterion?: any; CriterionBid?: any }): string | null {
  const c = item.Criterion ?? {};
  const m = Number(item.CriterionBid?.Multiplier ?? 0);
  switch (c.Type) {
    case "LocationCriterion": return `loc:${c.LocationId}`;
    case "AgeCriterion": return `age:${c.AgeRange}`;
    case "GenderCriterion": return `gender:${c.GenderType}`;
    case "DeviceCriterion": return `device:${c.DeviceName}:${m}`;
    default: return null;
  }
}

function desiredItems(adGroupId: string, spec: TargetingSpec, skipped: string[]): Criterion[] {
  const id = Number(adGroupId);
  const items: Criterion[] = [];

  for (const iso of targetedCountries(spec)) {
    const loc = BING_COUNTRY_LOCATION_IDS[iso];
    if (loc == null) { skipped.push(`geo:${iso}`); continue; }
    items.push(biddable(id, { Type: "LocationCriterion", LocationId: loc }));
  }
  for (const region of numericRegionIds(spec)) {
    items.push(biddable(id, { Type: "LocationCriterion", LocationId: Number(region) }));
  }

  if (hasAgeBounds(spec)) {
    for (const b of bucketsWithin(AGE_RANGES, spec)) {
      items.push(biddable(id, { Type: "AgeCriterion", AgeRange: b.range }));
    }
  }

  const genders = targetedGenders(spec);
  if (genders) {
    for (const g of genders) {
      items.push(biddable(id, { Type: "GenderCriterion", GenderType: g === "male" ? "Male" : "Female" }));
    }
  }

  const devices = targetedDevices(spec);
  if (devices) {
    for (const [neutral, name] of Object.entries(DEVICE_NAMES)) {
      const targeted = devices.includes(neutral as keyof typeof DEVICE_NAMES);
      items.push(biddable(id, { Type: "DeviceCriterion", DeviceName: name, OSName: null }, targeted ? 0 : -100));
    }
    if (devices.includes("connected_tv")) skipped.push("device:connected_tv");
  }
  return items;
}

/** Create-time plan: every desired criterion in one AddAdGroupCriterions body. */
export function buildBingCriteriaPlan(adGroupId: string, spec: TargetingSpec): BingCriteriaPlan {
  const skipped: string[] = [];
  const items = desiredItems(adGroupId, spec, skipped);
  return {
    body: items.length ? { AdGroupCriterions: items, CriterionType: "Targets" } : null,
    skipped,
  };
}

/** GetAdGroupCriterionsByIds body that lists every target criterion. */
export function existingCriteriaQuery(adGroupId: string) {
  return { AdGroupCriterionIds: null, AdGroupId: Number(adGroupId), CriterionType: "Targets" };
}

export interface BingCriteriaDelta {
  /** DeleteAdGroupCriterions body, or null when nothing to remove. */
  remove: { AdGroupCriterionIds: number[]; AdGroupId: number; CriterionType: "Targets" } | null;
  /** AddAdGroupCriterions body, or null when nothing to add. */
  add: BingCriteriaPlan["body"];
  skipped: string[];
}

/** Update-time delta against the criterions already on the ad group. */
export function buildBingCriteriaDelta(
  adGroupId: string,
  spec: TargetingSpec,
  existing: Array<{ Id?: number; Criterion?: any; CriterionBid?: any }>,
): BingCriteriaDelta {
  const skipped: string[] = [];
  const desired = desiredItems(adGroupId, spec, skipped);
  const desiredKeys = new Set(desired.map((d) => bingCriterionKey(d as any)));
  const existingKeys = new Set<string>();
  const removeIds: number[] = [];
  for (const e of existing) {
    const key = bingCriterionKey(e);
    if (!key || e.Id == null) continue;
    if (desiredKeys.has(key)) existingKeys.add(key);
    else removeIds.push(Number(e.Id));
  }
  const toAdd = desired.filter((d) => !existingKeys.has(bingCriterionKey(d as any) ?? ""));
  return {
    remove: removeIds.length ? { AdGroupCriterionIds: removeIds, AdGroupId: Number(adGroupId), CriterionType: "Targets" } : null,
    add: toAdd.length ? { AdGroupCriterions: toAdd, CriterionType: "Targets" } : null,
    skipped,
  };
}
