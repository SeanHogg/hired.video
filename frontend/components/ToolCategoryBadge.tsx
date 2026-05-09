// Top-level category chip shown next to a tool's title (full-page header
// + ToolCard). Reads from the catalog by toolId so the chip stays in sync
// across every surface — adding a new category or moving a tool between
// categories is a single catalog edit, not a per-page sweep.

import { Badge } from "@/components/ui/badge";
import { TOOLS_CATALOG, type ToolCategory } from "@/data/tools-catalog";
import { cn } from "@/lib/utils";

const CATEGORY_CLASSNAMES: Record<ToolCategory, string> = {
  Resume: "bg-blue-100 text-blue-800",
  Job: "bg-green-100 text-green-800",
  Profile: "bg-purple-100 text-purple-800",
  Career: "bg-amber-100 text-amber-800",
  Salary: "bg-emerald-100 text-emerald-800",
  Application: "bg-indigo-100 text-indigo-800",
  Extension: "bg-orange-100 text-orange-800",
};

interface Props {
  /** Catalog id. When `category` is omitted we resolve it here. */
  toolId?: string;
  /** Explicit override — used by ToolCard which already has the entry in
   *  hand and avoids the catalog re-lookup. */
  category?: ToolCategory;
  className?: string;
}

export function ToolCategoryBadge({ toolId, category, className }: Props) {
  const resolved =
    category ?? (toolId ? TOOLS_CATALOG.find((t) => t.id === toolId)?.category : undefined);
  if (!resolved) return null;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-medium uppercase tracking-wide",
        CATEGORY_CLASSNAMES[resolved],
        className,
      )}
    >
      {resolved}
    </Badge>
  );
}
