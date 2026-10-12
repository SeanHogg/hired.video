/**
 * Localized labels for the community-resource taxonomy (`@shared/community-resources`).
 * The shared registry stays the English SSoT + fallback; the i18n catalog
 * (`communityResources.category.<id>` / `communityResources.audience.<id>`)
 * overlays per-locale copy. Pure — pass the caller's `t`.
 */
import type { TFunction } from "i18next";
import {
  RESOURCE_AUDIENCE_LABEL,
  RESOURCE_CATEGORY_LABEL,
  type ResourceAudience,
  type ResourceCategory,
} from "@shared/community-resources";

export function resourceCategoryLabel(category: ResourceCategory, t: TFunction): string {
  return t(`communityResources.category.${category}`, { defaultValue: RESOURCE_CATEGORY_LABEL[category] });
}

export function resourceAudienceLabel(audience: ResourceAudience, t: TFunction): string {
  return t(`communityResources.audience.${audience}`, { defaultValue: RESOURCE_AUDIENCE_LABEL[audience] });
}
