/**
 * useTemplateRows — the Templates section's two orthogonal filter axes
 * (per #906 / PRD §6.1: Type (MediaKind) AND Use-for (TemplateCategory |
 * created | purchased)) and the unified row list they produce. Both pill
 * rows + the built-in predicate live in `TemplateCatalogFilters` —
 * DRY-shared with the New-project Wizard so both surfaces always render
 * the same pills against the same catalog.
 */
import { useMemo, useState } from "react";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import {
  filterBuiltinTemplates,
  type TemplateKindFilter,
  type TemplateUseForFilter,
} from "@/lib/studio/templates/template-filters";
import { isGetHiredTemplate } from "@/lib/studio/career-starts";
import type { OwnedTemplate, TemplateRow } from "./types";

export function useTemplateRows(ownedTemplates: OwnedTemplate[], query: string) {
  // Two orthogonal filter axes — see TemplateCatalogFilters for the
  // canonical types + pill rendering.
  const [useForFilter, setUseForFilter] = useState<TemplateUseForFilter>("all");
  const [kindFilter, setKindFilter] = useState<TemplateKindFilter>("all");

  // Unified row list for the single carousel. Owned rows lead the "All"
  // view so the user's own stuff sits before the starter catalog — the
  // built-ins are always reachable, but a recurring user expects to see
  // their library first. Category pills scope to built-ins;
  // Created/Purchased pills scope to owned.
  const filteredRows = useMemo<TemplateRow[]>(() => {
    const showOwned = useForFilter === "all" || useForFilter === "created" || useForFilter === "purchased";
    const showBuiltins = useForFilter === "all" || (useForFilter !== "created" && useForFilter !== "purchased");

    const builtinRows: TemplateRow[] = showBuiltins
      ? filterBuiltinTemplates(
          TEMPLATE_CATALOG,
          kindFilter,
          useForFilter,
          query,
        )
          // Get hired first, then More formats (stable within each).
          .map((t, i) => ({ t, i, first: isGetHiredTemplate(t.id) ? 0 : 1 }))
          .sort((a, b) => a.first - b.first || a.i - b.i)
          .map(({ t }) => ({ kind: "builtin" as const, template: t }))
      : [];

    const ownedRows: TemplateRow[] = showOwned
      ? ownedTemplates
          .filter((o) => {
            if (useForFilter === "created") return o.provenance === "created";
            if (useForFilter === "purchased") return o.provenance !== "created";
            return true;
          })
          // Kind axis applies to owned rows too post-#913 — the
          // `studio_templates.media_kind` column lets a creator's
          // podcast template show up under the Podcast filter and not
          // the Video filter.
          .filter((o) => kindFilter === "all" || o.template.mediaKind === kindFilter)
          .map((o) => ({ kind: "owned" as const, owned: o }))
      : [];

    return [...ownedRows, ...builtinRows];
  }, [useForFilter, kindFilter, query, ownedTemplates]);

  return { useForFilter, setUseForFilter, kindFilter, setKindFilter, filteredRows };
}
