/**
 * Single source of truth for the two-axis audience taxonomy used by
 * Resource Maps (#1616) and the content_audiences table (#0149).
 *
 *   - LIFE_STAGE_AUDIENCES  → "where are you in the journey?"
 *                             Drives /for/[audience] landing pages.
 *   - PROFESSION_AUDIENCES  → "what kind of creator/professional?"
 *                             Mirrors the studio template catalog at
 *                             frontend/components/studio/templates/audiences.ts.
 *
 * Both backend (search routes, repositories) and frontend (audience
 * picker, /for routes) import from here so the discriminator surface
 * can't drift across the wire.
 *
 * See migration 0149_audience_geo_demographics.sql for the storage
 * layout — `audience_taxonomy` column on content_audiences distinguishes
 * the two; `audience_key` is one of the values below.
 */
import { z } from "zod";

/** Life-stage / situational audiences. New in this pass. */
export const LIFE_STAGE_AUDIENCES = [
  "job_seekers",
  "employers",
  "recruiters",
  "recent_graduates",
  "students",
  "unemployed",
  "layoff_recovery",
  "career_changers",
  "returning_to_workforce",
  "veterans",
  "gig_economy",
  "international_job_seekers",
  "early_career",
  "senior_executives",
] as const;
export type LifeStageAudience = (typeof LIFE_STAGE_AUDIENCES)[number];

/** Profession / creator audiences. Mirrors the studio templates catalog;
 *  the studio catalog stays the in-memory SSoT for studio-template
 *  audience chips, this enum is the wire-level mirror used by anything
 *  outside studio that needs the same taxonomy (Resource Maps cross-axis,
 *  search audience filter, content_audiences DB rows). */
export const PROFESSION_AUDIENCES = [
  "athlete",
  "actor",
  "director",
  "musician",
  "creator",
  "founder",
  "developer",
  "designer",
  "data_analyst",
  "podcaster",
  "educator",
  "voice_actor",
  "game_dev",
  "illustrator",
  "animator",
  "cad_user",
] as const;
export type ProfessionAudience = (typeof PROFESSION_AUDIENCES)[number];

/** Discriminator stored on content_audiences.audience_taxonomy. */
export const AUDIENCE_TAXONOMIES = ["life_stage", "profession"] as const;
export type AudienceTaxonomy = (typeof AUDIENCE_TAXONOMIES)[number];

/** Any audience key from either taxonomy. */
export type AudienceKey = LifeStageAudience | ProfessionAudience;

const LIFE_STAGE_SET = new Set<string>(LIFE_STAGE_AUDIENCES);
const PROFESSION_SET = new Set<string>(PROFESSION_AUDIENCES);

/** Returns the taxonomy a key belongs to, or null if the key is unknown.
 *  Used by write paths to derive the taxonomy column from the key — so
 *  callers only pass `audienceKey`, never both. Single seam, no drift. */
export function taxonomyOf(key: string): AudienceTaxonomy | null {
  if (LIFE_STAGE_SET.has(key)) return "life_stage";
  if (PROFESSION_SET.has(key)) return "profession";
  return null;
}

/** Zod for any audience key — accepts both taxonomies. Use the
 *  taxonomy-specific schemas below when only one axis is valid. */
export const AudienceKeySchema = z.union([
  z.enum(LIFE_STAGE_AUDIENCES),
  z.enum(PROFESSION_AUDIENCES),
]);

export const LifeStageAudienceSchema = z.enum(LIFE_STAGE_AUDIENCES);
export const ProfessionAudienceSchema = z.enum(PROFESSION_AUDIENCES);
export const AudienceTaxonomySchema = z.enum(AUDIENCE_TAXONOMIES);

/** URL slug for an audience key (already lower_snake_case in the enum, so
 *  this is identity — exposed as a helper so callers don't reach into the
 *  enum directly and so we can swap encoding rules later without touching
 *  call sites). Mirrors the cities.slug shape stored in the DB. */
export function audienceSlug(key: AudienceKey): string {
  return key.replaceAll("_", "-");
}

/** Inverse of audienceSlug() — used by the /for/[slug] route to resolve
 *  the route param back to the canonical enum key. Returns null when the
 *  slug doesn't match any known audience. */
export function audienceKeyFromSlug(slug: string): AudienceKey | null {
  const candidate = slug.replaceAll("-", "_");
  return taxonomyOf(candidate) != null ? (candidate as AudienceKey) : null;
}
