/**
 * localize-audience — shared i18n resolution for the audience registry.
 *
 * shared/audiences-registry.ts is a plain TS module (no React) and stays
 * the canonical ENGLISH source of truth. These helpers run at the render
 * site (where a `t` is in scope) and resolve each registry string through
 * the `audiences.<key>.*` / `audienceFeatures.<featureKey>.*` convention,
 * always passing the registry English as i18next `defaultValue` so a
 * missing translation still renders real copy.
 *
 * Per DRY rule: every /for/[audience] render site (AudienceHero,
 * ToolShowcase, RelatedAudiences, AudienceLinks) resolves through here
 * instead of re-implementing the key shape.
 */
import type { TFunction } from "i18next";
import type {
  AudienceFocusFeature,
  LifeStageAudienceMeta,
} from "@shared/audiences-registry";

/** Audience label, keyed by the stable enum (`audiences.<key>.label`). */
export function audienceLabel(t: TFunction, meta: Pick<LifeStageAudienceMeta, "key" | "label">): string {
  return t(`audiences.${meta.key}.label`, { defaultValue: meta.label });
}

/** Audience thesis / pain-point sentence (`audiences.<key>.thesis`). */
export function audienceThesis(t: TFunction, meta: Pick<LifeStageAudienceMeta, "key" | "thesis">): string {
  return t(`audiences.${meta.key}.thesis`, { defaultValue: meta.thesis });
}

/** Primary CTA label (`audiences.<key>.ctaPrimary`). */
export function audienceCtaPrimaryLabel(t: TFunction, meta: Pick<LifeStageAudienceMeta, "key" | "ctaPrimary">): string {
  return t(`audiences.${meta.key}.ctaPrimary`, { defaultValue: meta.ctaPrimary.label });
}

/** Secondary CTA label (`audiences.<key>.ctaSecondary`). */
export function audienceCtaSecondaryLabel(t: TFunction, meta: Pick<LifeStageAudienceMeta, "key" | "ctaSecondary">): string {
  return t(`audiences.${meta.key}.ctaSecondary`, { defaultValue: meta.ctaSecondary.label });
}

/**
 * Feature copy is keyed by the feature's OWN stable key (e.g.
 * `audienceFeatures.resume_builder.label`) — NOT the audience key — so a
 * feature reused across multiple audiences shares one translation.
 */
export function featureLabel(t: TFunction, feature: AudienceFocusFeature): string {
  return t(`audienceFeatures.${feature.key}.label`, { defaultValue: feature.label });
}

export function featureBlurb(t: TFunction, feature: AudienceFocusFeature): string {
  return t(`audienceFeatures.${feature.key}.blurb`, { defaultValue: feature.blurb });
}
