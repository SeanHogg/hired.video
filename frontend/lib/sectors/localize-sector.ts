/**
 * Localized accessor for the sector taxonomy (`@shared/sectors`).
 *
 * The shared registry stays the English single-source-of-truth for the slug
 * list + fallback copy; this overlays per-locale `label` / `tagline` from the
 * i18n catalog (`sectors.<slug>.{label,tagline}`), falling back to the
 * registry English via `defaultValue`. Mirrors lib/studio/localize-audience.ts.
 */
import type { TFunction } from "i18next";
import type { SectorMeta } from "@shared/sectors";

export interface LocalizedSectorCopy {
  label: string;
  tagline: string;
}

/** Resolve a sector's localized label + tagline. Pure — pass the caller's `t`. */
export function localizeSector(meta: SectorMeta, t: TFunction): LocalizedSectorCopy {
  return {
    label: t(`sectors.${meta.slug}.label`, { defaultValue: meta.label }),
    tagline: t(`sectors.${meta.slug}.tagline`, { defaultValue: meta.tagline }),
  };
}
