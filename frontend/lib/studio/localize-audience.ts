/**
 * Localized accessor for the studio audience taxonomy (#2249).
 *
 * `audiences.ts` (AUDIENCES) stays the English single-source-of-truth for the
 * id list + the fallback copy; this helper overlays per-locale `label` / `blurb`
 * from the i18n catalog (`audienceProfessions.<id>.{label,blurb}`) when present,
 * falling back to the registry English via `defaultValue`. The /for/[audience]
 * profession landing page renders its hero `<h1>` + lede + the derived
 * `<title>` / meta description / CollectionPage JSON-LD through this so es / fr-CA
 * visitors get a fully-localized headline + SERP snippet, not English.
 */
import type { TFunction } from "i18next";
import type { AudienceDef } from "@/components/studio/templates/audiences";

export interface LocalizedAudienceCopy {
  /** Plural display label, e.g. "Directors" / "Directores" / "Réalisateurs". */
  label: string;
  /** One-line descriptor used as the hero lede + OG/meta description. */
  blurb: string;
}

/** Resolve an audience's localized label + blurb. Pure — pass the page's `t`. */
export function localizeAudience(
  audience: AudienceDef,
  t: TFunction,
): LocalizedAudienceCopy {
  return {
    label: t(`audienceProfessions.${audience.id}.label`, {
      defaultValue: audience.label,
    }),
    blurb: t(`audienceProfessions.${audience.id}.blurb`, {
      defaultValue: audience.blurb,
    }),
  };
}
