/**
 * The built-in template catalog's two filter axes — Type (MediaKind) and
 * Use-for (TemplateCategory, plus the landing page's owned-only "Created" /
 * "Purchased") — and the predicate that applies them. Shared by the
 * /studio landing chooser and the New-project Wizard; the pill / dropdown UI
 * is `TemplateCatalogFilters` (components/studio/templates).
 */
import type { MediaKind } from "@shared/media-kinds";
import type { TemplateCategory, TemplateDef } from "./catalog";

export type TemplateKindFilter = "all" | MediaKind;
// `created` / `purchased` only resolve to OWNED rows — the built-in
// catalog never carries those values. The wizard hides those pills via
// `includeOwnedPills={false}`; the landing page shows them.
export type TemplateUseForFilter =
  | "all"
  | TemplateCategory
  | "created"
  | "purchased";

/** Apply the Type + Use-for filters against the built-in catalog. When
 *  `useForFilter` is `created` or `purchased` the result is empty — those
 *  pills filter to OWNED rows only, which built-ins never are. */
export function filterBuiltinTemplates(
  catalog: TemplateDef[],
  kindFilter: TemplateKindFilter,
  useForFilter: TemplateUseForFilter,
  query?: string,
): TemplateDef[] {
  if (useForFilter === "created" || useForFilter === "purchased") return [];
  const q = (query ?? "").trim().toLowerCase();
  return catalog.filter((t) => {
    if (kindFilter !== "all" && t.mediaKind !== kindFilter) return false;
    if (useForFilter !== "all" && t.category !== useForFilter) return false;
    if (!q) return true;
    return (
      t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
    );
  });
}
