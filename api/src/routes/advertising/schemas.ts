/**
 * Request schemas for /api/advertising.
 *
 * Each resource has a BASE schema with no `.default()`s. Create schemas
 * add the defaults on top; update schemas are `Base.partial()`. Zod 4
 * applies a `.default()` even inside `.partial()`, so deriving an update
 * schema from a create schema would silently reset every omitted field
 * (ctaText, placementType, pricingModel, bidStrategy, objective) on PUT.
 */

import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { AD_SUBJECT_TYPES } from "../../../../shared/ad-content-target.js";
import { AdSetTargetingSchema } from "../../../../shared/ad-targeting.js";

// ─── Boosts ───────────────────────────────────────────────────────────────

export const CreateBoostSchema = z.object({
  jobId:         UuidLikeSchema,
  placementType: z.enum(["search_top", "discovery_feed", "both"]),
  pricingModel:  z.enum(["cpm", "cpc"]),
  budgetCents:   z.number().int().min(1000), // minimum $10
  durationDays:  z.number().int().min(1).max(90),
});

// ─── Campaigns ────────────────────────────────────────────────────────────

const CAMPAIGN_OBJECTIVES = ["AWARENESS", "TRAFFIC", "APPLICATIONS", "EMPLOYER_BRAND"] as const;

const CampaignBase = z.object({
  name:        z.string().min(1).max(120),
  objective:   z.enum(CAMPAIGN_OBJECTIVES),
  budgetCents: z.number().int().min(0).optional(),
  startAt:     z.string().datetime().optional(),
  endAt:       z.string().datetime().optional(),
  notes:       z.string().max(500).optional(),
});

export const CreateCampaignSchema = CampaignBase.extend({
  objective: z.enum(CAMPAIGN_OBJECTIVES).default("TRAFFIC"),
});
export const UpdateCampaignSchema = CampaignBase.partial();

// ─── Ad sets ──────────────────────────────────────────────────────────────

const AD_SET_PLACEMENTS = ["search_top", "discovery_feed", "both", "email", "push"] as const;
const AD_SET_PRICING = ["cpm", "cpc", "auto"] as const;
const AD_SET_BID_STRATEGIES = ["manual", "maximize_clicks", "maximize_impressions", "target_cpa"] as const;

const AdSetBase = z.object({
  name:              z.string().min(1).max(120),
  placementType:     z.enum(AD_SET_PLACEMENTS),
  pricingModel:      z.enum(AD_SET_PRICING),
  bidStrategy:       z.enum(AD_SET_BID_STRATEGIES),
  bidAmountCents:    z.number().int().min(1).optional(),
  budgetCents:       z.number().int().min(0).optional(),
  targetingJson:     AdSetTargetingSchema.optional(),
  frequencyCapCount: z.number().int().min(1).max(100).optional(),
  frequencyCapHours: z.number().int().min(1).max(168).optional(),
  startAt:           z.string().datetime().optional(),
  endAt:             z.string().datetime().optional(),
});

export const CreateAdSetSchema = AdSetBase.extend({
  placementType: z.enum(AD_SET_PLACEMENTS).default("search_top"),
  pricingModel:  z.enum(AD_SET_PRICING).default("cpc"),
  bidStrategy:   z.enum(AD_SET_BID_STRATEGIES).default("manual"),
});
export const UpdateAdSetSchema = AdSetBase.partial();

// ─── Ads ──────────────────────────────────────────────────────────────────

const AD_CTAS = ["Apply Now", "Learn More", "Watch Our Story", "View Jobs", "Get Started"] as const;

const AdContentTargetSchema = z.object({
  subjectType: z.enum(AD_SUBJECT_TYPES),
  subjectId:   UuidLikeSchema,
});

const AdBase = z.object({
  name:           z.string().min(1).max(120),
  headline:       z.string().min(1).max(150),
  description:    z.string().max(300).optional(),
  ctaText:        z.enum(AD_CTAS),
  ctaUrl:         z.string().url().optional(),
  imageUrl:       z.string().url().optional(),
  videoUrl:       z.string().url().optional(),
  destinationUrl: z.string().url().optional(),
  variantGroup:   z.enum(["A", "B"]).optional(),
  /** What the ad promotes (#176). null clears it on update. */
  target:         AdContentTargetSchema.nullable().optional(),
});

export const CreateAdSchema = AdBase.extend({
  ctaText: z.enum(AD_CTAS).default("Apply Now"),
});
export const UpdateAdSchema = AdBase.partial();

/** Drop keys whose value is undefined, so an update never writes a field
 *  the client didn't send. */
export function definedOnly<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}
