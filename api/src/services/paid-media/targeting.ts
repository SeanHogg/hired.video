/**
 * Platform-neutral TargetingSpec normalisation shared by the Google and
 * Bing criterion builders (#976 / #977). Each adapter maps these neutral
 * answers onto its own criterion DSL; neither re-derives them.
 *
 * Pure — no I/O. Lookup tables are small literals (no work at module load
 * beyond allocating them).
 */

import type { TargetingSpec } from "./ports/types.js";

export type NeutralDevice = "mobile" | "desktop" | "tablet" | "connected_tv";
export type NeutralGender = "male" | "female";

/** ISO 3166-1 alpha-2 → numeric. Google's country geo-target constant is
 *  2000 + this number (e.g. US 840 → geoTargetConstants/2840). */
export const ISO2_TO_NUMERIC: Readonly<Record<string, number>> = {
  US: 840, CA: 124, MX: 484, GB: 826, IE: 372, DE: 276, FR: 250, ES: 724,
  IT: 380, NL: 528, BE: 56, CH: 756, AT: 40, SE: 752, NO: 578, DK: 208,
  FI: 246, PT: 620, PL: 616, AU: 36, NZ: 554, IN: 356, BR: 76, AR: 32,
  CL: 152, CO: 170, JP: 392, SG: 702, ZA: 710, PH: 608,
};

export interface AgeBucket {
  min: number;
  /** Inclusive; Infinity for the open top bucket. */
  max: number;
}

/** Buckets that overlap [ageMin, ageMax]; every bucket when no bound is set. */
export function bucketsWithin<B extends AgeBucket>(buckets: readonly B[], spec: TargetingSpec): B[] {
  const min = spec.demographics?.ageMin ?? 0;
  const max = spec.demographics?.ageMax ?? Infinity;
  return buckets.filter((b) => b.min <= max && b.max >= min);
}

/** Whether the spec narrows age at all. */
export function hasAgeBounds(spec: TargetingSpec): boolean {
  return spec.demographics?.ageMin != null || spec.demographics?.ageMax != null;
}

/** Genders the spec targets, or null for "everyone" (none / "all"). */
export function targetedGenders(spec: TargetingSpec): NeutralGender[] | null {
  const g = spec.demographics?.genders ?? [];
  if (g.length === 0 || g.includes("all")) return null;
  return (["male", "female"] as const).filter((x) => g.includes(x));
}

/** Devices the spec targets, or null for "every device". */
export function targetedDevices(spec: TargetingSpec): NeutralDevice[] | null {
  const d = spec.devicePlatforms ?? [];
  return d.length ? [...new Set(d)] : null;
}

/** Upper-cased, de-duplicated ISO2 country list. */
export function targetedCountries(spec: TargetingSpec): string[] {
  return [...new Set((spec.geo?.countries ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))];
}

/** Region values that are already platform-native numeric IDs (the
 *  TargetingSpec contract: regions are resolved per platform). */
export function numericRegionIds(spec: TargetingSpec): string[] {
  return [...new Set((spec.geo?.regions ?? []).filter((r) => /^\d+$/.test(r)))];
}

/** Language subtag ("en-US" → "en"), de-duplicated. */
export function targetedLanguages(spec: TargetingSpec): string[] {
  return [...new Set((spec.demographics?.languages ?? []).map((l) => l.split("-")[0]!.toLowerCase()))];
}
