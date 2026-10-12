// Localization seam for the tool catalog.
//
// `data/tools-catalog.ts` is a plain data array whose string fields
// (title / description / CTA / feature bullets / stat value+label /
// status-badge label) are authored in English. Every surface that renders
// a catalog entry — the <ToolCard> grid, the tools table, the tool detail
// page, the entity action submenu, the AI-Coach handoff cards, and the
// unified-search feed — must show those strings in the active locale.
//
// Rather than sprinkle `t()` calls through each of those consumers (and
// risk them drifting), this module is the SINGLE seam: `localizeTool`
// returns a clone of a catalog entry with every user-facing string
// resolved through i18next, keyed off the entry's stable `id`. Behavioral
// fields (icon, href, tier, category, audienceRoles, …) pass through
// untouched, so a localized entry is a drop-in for the raw one anywhere.
//
// Key scheme (flat keys — the app sets `keySeparator: false`):
//   tools.card.<id>.title
//   tools.card.<id>.description
//   tools.card.<id>.cta
//   tools.card.<id>.feature.<n>
//   tools.card.<id>.stat.<n>.value
//   tools.card.<id>.stat.<n>.label
// Status badges are a small set of shared presets, so their labels live
// under `tools.badge.*` and translate once for every tool that uses them.
//
// The canonical English value is passed as the i18next default, so a
// missing key falls back to the catalog copy rather than rendering a raw
// key — non-EN users see real English while their locale loads, exactly
// like the rest of the app.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  TOOLS_CATALOG,
  type ToolCardStat,
  type ToolCatalogEntry,
  type ToolStatusBadge,
} from "@/data/tools-catalog";

/** Map a shared status-badge preset (matched on its English label) to the
 *  `tools.badge.*` key that translates it. Tools that don't use a preset
 *  (none today) fall through to their own label as the default value. */
const BADGE_KEY_BY_LABEL: Record<string, string> = {
  Available: "tools.badge.available",
  New: "tools.badge.new",
  Hot: "tools.badge.hot",
  Beta: "tools.badge.beta",
  "Chrome Extension": "tools.badge.chromeExtension",
  "Available in AI Chat": "tools.badge.availableInAiChat",
};

function localizeBadge(badge: ToolStatusBadge, t: TFunction): ToolStatusBadge {
  const key = BADGE_KEY_BY_LABEL[badge.label];
  if (!key) return badge;
  return { ...badge, label: t(key, badge.label) };
}

/** Return a clone of `entry` with every user-facing string resolved in the
 *  active locale. Pure — safe to call in a memo or a render body. */
export function localizeTool(
  entry: ToolCatalogEntry,
  t: TFunction,
): ToolCatalogEntry {
  const base = `tools.card.${entry.id}`;
  return {
    ...entry,
    title: t(`${base}.title`, entry.title),
    description: t(`${base}.description`, entry.description),
    ctaLabel:
      entry.ctaLabel === undefined
        ? entry.ctaLabel
        : t(`${base}.cta`, entry.ctaLabel),
    features: entry.features?.map((feature, i) =>
      t(`${base}.feature.${i}`, feature),
    ),
    stats: entry.stats
      ? ([
          {
            ...entry.stats[0],
            value: t(`${base}.stat.0.value`, entry.stats[0].value),
            label: t(`${base}.stat.0.label`, entry.stats[0].label),
          },
          {
            ...entry.stats[1],
            value: t(`${base}.stat.1.value`, entry.stats[1].value),
            label: t(`${base}.stat.1.label`, entry.stats[1].label),
          },
        ] as [ToolCardStat, ToolCardStat])
      : entry.stats,
    statusBadge: entry.statusBadge
      ? localizeBadge(entry.statusBadge, t)
      : entry.statusBadge,
  };
}

/** Hook form for a single entry — re-resolves on locale change. */
export function useLocalizedTool(entry: ToolCatalogEntry): ToolCatalogEntry {
  const { t } = useTranslation();
  return useMemo(() => localizeTool(entry, t), [entry, t]);
}

/** Hook form for a list — re-resolves on locale change. */
export function useLocalizedTools(
  entries: ToolCatalogEntry[],
): ToolCatalogEntry[] {
  const { t } = useTranslation();
  return useMemo(() => entries.map((e) => localizeTool(e, t)), [entries, t]);
}

/** A tool's title in the active locale, by catalog id (the id itself when
 *  the catalog has no entry). */
export function useToolTitle(): (toolId: string) => string {
  const { t } = useTranslation();
  return useMemo(() => {
    const byId = new Map(TOOLS_CATALOG.map((entry) => [entry.id, entry.title]));
    return (toolId: string) => t(`tools.card.${toolId}.title`, byId.get(toolId) ?? toolId);
  }, [t]);
}
