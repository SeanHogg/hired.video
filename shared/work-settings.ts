/**
 * Work-setting SSoT (#2069) — one canonical vocabulary + normalizer for
 * where a role is performed: on-site, remote, or hybrid.
 *
 * Before this the concept was lossy: `job_items` only had an `is_remote`
 * boolean, so the form's three-way choice (Onsite / Remote / Hybrid) was
 * folded to true/false and Hybrid became indistinguishable from Onsite
 * after save. This module adds the canonical kebab vocabulary; the
 * `work_setting` column + the optional hybrid day-split live on the row.
 *
 * Hybrid roles carry a weekly split — e.g. "2 days on-site, 3 days
 * remote" — captured as two small integers. `is_remote` stays as a
 * derived convenience (`work_setting === "remote"`) so every existing
 * consumer keeps working.
 *
 * Same pattern as shared/employment-types.ts: everything that READS or
 * COMPARES a work setting should `normalizeWorkSetting()` first; writers
 * store the canonical value.
 */

import { z } from "zod";

/** Canonical work settings, kebab-case. */
export const WORK_SETTINGS = ["onsite", "remote", "hybrid"] as const;
export type WorkSetting = (typeof WORK_SETTINGS)[number];

/** Display labels — single source for dropdowns + cards. */
export const WORK_SETTING_LABELS: Record<WorkSetting, string> = {
  onsite: "On-site",
  remote: "Remote",
  hybrid: "Hybrid",
};

const CANONICAL_SET = new Set<string>(WORK_SETTINGS);

/** Aliases for spellings that don't collapse to canonical by the generic
 *  lower-case rule alone (keys are already lower-cased, separators stripped). */
const ALIAS: Record<string, WorkSetting> = {
  onpremise: "onsite",
  onprem: "onsite",
  inoffice: "onsite",
  office: "onsite",
  onlocation: "onsite",
  wfh: "remote",
  workfromhome: "remote",
  fullyremote: "remote",
  flexible: "hybrid",
  flex: "hybrid",
};

function collapse(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Fold any spelling (PascalCase "Onsite", "On-site", "WFH", …) into the
 * canonical kebab value. Returns null when the input doesn't map to a
 * known setting, so callers can decide whether to drop it.
 *
 *   normalizeWorkSetting("Onsite")  → "onsite"
 *   normalizeWorkSetting("On-site") → "onsite"
 *   normalizeWorkSetting("WFH")     → "remote"
 *   normalizeWorkSetting("Hybrid")  → "hybrid"
 */
export function normalizeWorkSetting(raw: string | null | undefined): WorkSetting | null {
  if (!raw) return null;
  if (CANONICAL_SET.has(raw.toLowerCase())) return raw.toLowerCase() as WorkSetting;
  const collapsed = collapse(raw);
  if (CANONICAL_SET.has(collapsed)) return collapsed as WorkSetting;
  return ALIAS[collapsed] ?? null;
}

/** Lenient Zod schema accepting any spelling, outputting canonical kebab. */
export const WorkSettingSchema = z.preprocess(
  (v) => (typeof v === "string" ? (normalizeWorkSetting(v) ?? v) : v),
  z.enum(WORK_SETTINGS),
);

/**
 * Clamp + reconcile a hybrid day-split. Days are only meaningful for
 * `hybrid`; for onsite/remote they're forced to null. A negative or
 * absurd value is clamped to [0, 7]. Returns the pair to persist.
 */
export function normalizeHybridDays(
  setting: WorkSetting | null,
  onsiteDays: number | null | undefined,
  remoteDays: number | null | undefined,
): { onsiteDaysPerWeek: number | null; remoteDaysPerWeek: number | null } {
  if (setting !== "hybrid") return { onsiteDaysPerWeek: null, remoteDaysPerWeek: null };
  const clamp = (n: number | null | undefined): number | null =>
    n == null || Number.isNaN(n) ? null : Math.max(0, Math.min(7, Math.round(n)));
  return { onsiteDaysPerWeek: clamp(onsiteDays), remoteDaysPerWeek: clamp(remoteDays) };
}

/** Human label incl. the day-split for hybrid, e.g. "Hybrid (2 on-site / 3 remote)". */
export function formatWorkSetting(
  setting: WorkSetting | null | undefined,
  onsiteDays?: number | null,
  remoteDays?: number | null,
): string {
  if (!setting) return "";
  if (setting === "hybrid" && (onsiteDays != null || remoteDays != null)) {
    const parts: string[] = [];
    if (onsiteDays != null) parts.push(`${onsiteDays} on-site`);
    if (remoteDays != null) parts.push(`${remoteDays} remote`);
    return parts.length ? `${WORK_SETTING_LABELS.hybrid} (${parts.join(" / ")})` : WORK_SETTING_LABELS.hybrid;
  }
  return WORK_SETTING_LABELS[setting];
}
