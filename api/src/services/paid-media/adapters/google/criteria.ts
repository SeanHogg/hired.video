/**
 * #976 — Google Ads targeting criteria for one ad group.
 *
 * Google keeps targeting on separate resource families: geo, language and
 * device live on the campaign (CampaignCriterion), age and gender on the
 * ad group (AdGroupCriterion). All of them go out in ONE
 * `customers/{id}/googleAds:mutate` call (mutateOperations mix resource
 * types), so an ad set's targeting lands atomically or not at all.
 *
 *   geo       → CampaignCriterion.location.geoTargetConstant
 *               (country = 2000 + ISO numeric; numeric spec.geo.regions
 *               pass through as native geo-target ids)
 *   language  → CampaignCriterion.language.languageConstant
 *   device    → CampaignCriterion.device with bidModifier 0 (-100%) for
 *               each device NOT targeted and 1 (no adjustment) for targeted
 *               ones. Device criteria can't be removed in Google Ads, so an
 *               existing one is UPDATED (and reset to 1 when the spec drops
 *               device targeting), never removed.
 *   age       → negative AdGroupCriterion.ageRange for each range outside
 *               [ageMin, ageMax]
 *   gender    → negative AdGroupCriterion.gender for each gender NOT targeted
 *
 * Idempotency: callers pass the criteria already on the platform (read via
 * GAQL); the batch removes managed criteria that are no longer wanted and
 * creates only the missing ones.
 *
 * Docs: https://developers.google.com/google-ads/api/rest/reference/rest/v16/customers/mutate
 *       https://developers.google.com/google-ads/api/docs/targeting/criteria
 */

import type { TargetingSpec } from "../../ports/types.js";
import {
  ISO2_TO_NUMERIC,
  bucketsWithin,
  hasAgeBounds,
  numericRegionIds,
  targetedCountries,
  targetedDevices,
  targetedGenders,
  targetedLanguages,
  type AgeBucket,
} from "../../targeting.js";

const AGE_RANGES: ReadonlyArray<AgeBucket & { type: string }> = [
  { type: "AGE_RANGE_18_24", min: 18, max: 24 },
  { type: "AGE_RANGE_25_34", min: 25, max: 34 },
  { type: "AGE_RANGE_35_44", min: 35, max: 44 },
  { type: "AGE_RANGE_45_54", min: 45, max: 54 },
  { type: "AGE_RANGE_55_64", min: 55, max: 64 },
  { type: "AGE_RANGE_65_UP", min: 65, max: Infinity },
];

const DEVICE_TYPES = { mobile: "MOBILE", desktop: "DESKTOP", tablet: "TABLET", connected_tv: "CONNECTED_TV" } as const;

/** Google language constant ids for the languages we market in. */
const LANGUAGE_CONSTANTS: Readonly<Record<string, number>> = {
  en: 1000, de: 1001, fr: 1002, es: 1003, it: 1004, ja: 1005, nl: 1010, pt: 1014,
};

/** One desired criterion, keyed so it can be diffed against the platform. */
interface DesiredCriterion {
  key: string;
  level: "campaign" | "adGroup";
  body: Record<string, unknown>;
}

/** A criterion that already exists on the platform. */
export interface ExistingCriterion {
  key: string;
  resourceName: string;
  level: "campaign" | "adGroup";
}

export interface GoogleCriteriaPlan {
  mutateOperations: Array<Record<string, unknown>>;
  /** Spec values with no Google mapping (reported, never thrown). */
  skipped: string[];
}

function desiredCriteria(spec: TargetingSpec, skipped: string[]): DesiredCriterion[] {
  const out: DesiredCriterion[] = [];

  for (const iso of targetedCountries(spec)) {
    const numeric = ISO2_TO_NUMERIC[iso];
    if (numeric == null) { skipped.push(`geo:${iso}`); continue; }
    const id = 2000 + numeric;
    out.push({ key: `loc:${id}`, level: "campaign", body: { location: { geoTargetConstant: `geoTargetConstants/${id}` } } });
  }
  for (const id of numericRegionIds(spec)) {
    out.push({ key: `loc:${id}`, level: "campaign", body: { location: { geoTargetConstant: `geoTargetConstants/${id}` } } });
  }

  for (const lang of targetedLanguages(spec)) {
    const id = LANGUAGE_CONSTANTS[lang];
    if (id == null) { skipped.push(`language:${lang}`); continue; }
    out.push({ key: `lang:${id}`, level: "campaign", body: { language: { languageConstant: `languageConstants/${id}` } } });
  }

  const devices = targetedDevices(spec);
  if (devices) {
    for (const [neutral, type] of Object.entries(DEVICE_TYPES)) {
      const bidModifier = devices.includes(neutral as keyof typeof DEVICE_TYPES) ? 1 : 0;
      out.push({ key: `device:${type}`, level: "campaign", body: { device: { type }, bidModifier } });
    }
  }

  if (hasAgeBounds(spec)) {
    const keep = new Set(bucketsWithin(AGE_RANGES, spec).map((b) => b.type));
    for (const r of AGE_RANGES) {
      if (keep.has(r.type)) continue;
      out.push({ key: `age:${r.type}`, level: "adGroup", body: { negative: true, ageRange: { type: r.type } } });
    }
  }

  const genders = targetedGenders(spec);
  if (genders) {
    for (const g of ["male", "female"] as const) {
      if (genders.includes(g)) continue;
      const type = g.toUpperCase();
      out.push({ key: `gender:${type}`, level: "adGroup", body: { negative: true, gender: { type } } });
    }
  }
  return out;
}

/** Build the single mutate batch for one ad group. */
export function buildGoogleCriteriaPlan(args: {
  customerId: string;
  campaignId: string;
  adGroupId: string;
  spec: TargetingSpec;
  existing?: ExistingCriterion[];
}): GoogleCriteriaPlan {
  const skipped: string[] = [];
  const desired = desiredCriteria(args.spec, skipped);
  const existing = args.existing ?? [];
  const desiredKeys = new Set(desired.map((d) => `${d.level}|${d.key}`));
  const existingKeys = new Set(existing.map((e) => `${e.level}|${e.key}`));
  const campaign = `customers/${args.customerId}/campaigns/${args.campaignId}`;
  const adGroup = `customers/${args.customerId}/adGroups/${args.adGroupId}`;

  const desiredByKey = new Map(desired.map((d) => [`${d.level}|${d.key}`, d]));
  const mutateOperations: Array<Record<string, unknown>> = [];
  for (const e of existing) {
    if (e.key.startsWith("device:")) {
      // Never removable — update the modifier (reset to 1 when untargeted).
      const bidModifier = (desiredByKey.get(`${e.level}|${e.key}`)?.body.bidModifier as number | undefined) ?? 1;
      mutateOperations.push({
        campaignCriterionOperation: { update: { resourceName: e.resourceName, bidModifier }, updateMask: "bidModifier" },
      });
      continue;
    }
    if (desiredKeys.has(`${e.level}|${e.key}`)) continue;
    mutateOperations.push(
      e.level === "campaign"
        ? { campaignCriterionOperation: { remove: e.resourceName } }
        : { adGroupCriterionOperation: { remove: e.resourceName } },
    );
  }
  for (const d of desired) {
    if (existingKeys.has(`${d.level}|${d.key}`)) continue;
    mutateOperations.push(
      d.level === "campaign"
        ? { campaignCriterionOperation: { create: { campaign, ...d.body } } }
        : { adGroupCriterionOperation: { create: { adGroup, ...d.body } } },
    );
  }
  return { mutateOperations, skipped };
}

/** GAQL that lists the criteria this module manages for one ad group. */
export function existingCriteriaQueries(campaignId: string, adGroupId: string): { campaign: string; adGroup: string } {
  return {
    campaign:
      "SELECT campaign_criterion.resource_name, campaign_criterion.type, campaign_criterion.location.geo_target_constant, " +
      "campaign_criterion.language.language_constant, campaign_criterion.device.type FROM campaign_criterion " +
      `WHERE campaign.id = ${Number(campaignId)} AND campaign_criterion.type IN ('LOCATION', 'LANGUAGE', 'DEVICE')`,
    adGroup:
      "SELECT ad_group_criterion.resource_name, ad_group_criterion.type, ad_group_criterion.age_range.type, " +
      "ad_group_criterion.gender.type FROM ad_group_criterion " +
      `WHERE ad_group.id = ${Number(adGroupId)} AND ad_group_criterion.type IN ('AGE_RANGE', 'GENDER') AND ad_group_criterion.negative = TRUE`,
  };
}

/** Map GAQL search rows (REST camelCase) to ExistingCriterion keys. */
export function parseExistingCriteria(rows: Array<Record<string, any>>): ExistingCriterion[] {
  const out: ExistingCriterion[] = [];
  for (const r of rows) {
    const cc = r.campaignCriterion;
    if (cc?.resourceName) {
      const loc = cc.location?.geoTargetConstant as string | undefined;
      const lang = cc.language?.languageConstant as string | undefined;
      const dev = cc.device?.type as string | undefined;
      const key = loc ? `loc:${loc.split("/").pop()}` : lang ? `lang:${lang.split("/").pop()}` : dev ? `device:${dev}` : null;
      if (key) out.push({ key, resourceName: cc.resourceName, level: "campaign" });
    }
    const ac = r.adGroupCriterion;
    if (ac?.resourceName) {
      const age = ac.ageRange?.type as string | undefined;
      const gender = ac.gender?.type as string | undefined;
      const key = age ? `age:${age}` : gender ? `gender:${gender}` : null;
      if (key) out.push({ key, resourceName: ac.resourceName, level: "adGroup" });
    }
  }
  return out;
}
