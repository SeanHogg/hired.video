// Top-level category chip shown with a tool's title (tool page header,
// ToolCard, tools table). Reads from the catalog by toolId so the chip
// stays in sync across every surface — moving a tool between categories
// is a single catalog edit. Rendered as the design system's MonoChip.

import { useTranslation } from "react-i18next";
import MonoChip from "@/components/templates/MonoChip";
import { TOOLS_CATALOG, type ToolCategory } from "@/data/tools-catalog";

interface Props {
  /** Catalog id. When `category` is omitted we resolve it here. */
  toolId?: string;
  /** Explicit override — used by ToolCard which already has the entry in
   *  hand and avoids the catalog re-lookup. */
  category?: ToolCategory;
  className?: string;
}

/** i18n key for a catalog category — one rule for chips and filter rows. */
export function toolCategoryLabelKey(category: ToolCategory): string {
  return `tools.category.${category}`;
}

export function ToolCategoryBadge({ toolId, category, className }: Props) {
  const { t } = useTranslation();
  const resolved =
    category ?? (toolId ? TOOLS_CATALOG.find((tl) => tl.id === toolId)?.category : undefined);
  if (!resolved) return null;

  return <MonoChip className={className}>{t(toolCategoryLabelKey(resolved))}</MonoChip>;
}
