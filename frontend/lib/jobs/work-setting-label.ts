// Localized work-setting label (#2092). The shared `formatWorkSetting`
// helper (shared/work-settings.ts) returns English literals and is the SSoT
// for the hybrid day-split SHAPE; this is its localized presentation layer so
// every read surface (JobCard / JobDetail / Jobs filter) renders the same
// "Hybrid (2 on-site / 3 remote)" string through i18n instead of re-deriving
// it. One place, per the DRY rule.

import { normalizeWorkSetting } from "@shared/work-settings";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Returns the localized work-setting label, appending the weekly day-split
 * for hybrid roles (e.g. "Hybrid (2 on-site / 3 remote)"). Empty string when
 * no recognisable setting is present, so callers can `&&`-guard the badge.
 */
export function workSettingLabel(
  t: TFn,
  setting: string | null | undefined,
  onsiteDays?: number | null,
  remoteDays?: number | null,
): string {
  const ws = normalizeWorkSetting(setting ?? undefined);
  if (!ws) return "";
  const base = t(`labels.workSetting.${ws}`);
  if (ws === "hybrid" && (onsiteDays != null || remoteDays != null)) {
    const parts: string[] = [];
    if (onsiteDays != null) parts.push(t("labels.workSetting.daysOnsite", { count: onsiteDays }));
    if (remoteDays != null) parts.push(t("labels.workSetting.daysRemote", { count: remoteDays }));
    if (parts.length) return `${base} (${parts.join(" / ")})`;
  }
  return base;
}
