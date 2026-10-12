import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ExplicitCategory } from "@shared/moderation/explicit";
import { formatExplicitCategories } from "@/lib/moderation/explicit-content-error";

/**
 * Localized, human list of explicit-scan categories ("weapons and
 * swearing" / "des armes et des grossièretés"). Shared by the Post-panel
 * notice, the SuperAdmin review queue and the global explicit-content toast.
 */
export function useExplicitCategoryList(): (categories: readonly ExplicitCategory[]) => string {
  const { t, i18n } = useTranslation();
  return useCallback(
    (categories) => formatExplicitCategories(categories, (key, options) => String(t(key, options)), i18n.language),
    [t, i18n.language],
  );
}
