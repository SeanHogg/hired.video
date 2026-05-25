// Two-axis filter bar over the built-in template catalog — Type (MediaKind)
// + Use-for (TemplateCategory, with optional "Created" / "Purchased" pills
// for the landing page's owned-template surface). Single source of truth
// shared by:
//   - /studio landing chooser (templates row)
//   - New-project Wizard (step 0 chooser)
//
// Per `feedback_extract_on_duplication`: both surfaces consume this
// component; neither hand-rolls its own pill array. Adding a new
// MediaKind or a new TemplateCategory automatically lights it up in
// every surface that mounts the filter bar.
//
// The `filterBuiltinTemplates` helper applies the same axes against
// `TEMPLATE_CATALOG` so callers don't reimplement the predicate per
// surface.

import {
  MEDIA_KINDS,
  MEDIA_KIND_UI,
  type MediaKind,
} from "@shared/media-kinds";
import { CategoryPill, FilterPillRow } from "@/components/studio/shared/FilterPills";
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type TemplateDef,
} from "./catalog";

export type TemplateKindFilter = "all" | MediaKind;
// `created` / `purchased` only resolve to OWNED rows — the built-in
// catalog never carries those values. The wizard hides those pills via
// `includeOwnedPills={false}`; the landing page shows them.
export type TemplateUseForFilter =
  | "all"
  | TemplateCategory
  | "created"
  | "purchased";

interface Props {
  kindFilter: TemplateKindFilter;
  onKindFilterChange: (next: TemplateKindFilter) => void;
  useForFilter: TemplateUseForFilter;
  onUseForFilterChange: (next: TemplateUseForFilter) => void;
  /** Landing page only — adds "Created" / "Purchased" pills for the
   *  user's owned-template subset. The wizard sets this `false` because
   *  it only authors fresh projects from built-in templates. */
  includeOwnedPills?: boolean;
}

export default function TemplateCatalogFilters({
  kindFilter,
  onKindFilterChange,
  useForFilter,
  onUseForFilterChange,
  includeOwnedPills = false,
}: Props) {
  return (
    <div>
      {/* Type axis — MediaKind. Reads MEDIA_KINDS so adding a kind
          (#894 phases 4/5) doesn't touch the consumer files. */}
      <FilterPillRow label="Type">
        <CategoryPill
          label="All"
          active={kindFilter === "all"}
          onClick={() => onKindFilterChange("all")}
        />
        {MEDIA_KINDS.map((kind) => (
          <CategoryPill
            key={kind}
            label={MEDIA_KIND_UI[kind].badgeLabel}
            active={kindFilter === kind}
            onClick={() => onKindFilterChange(kind)}
          />
        ))}
      </FilterPillRow>
      {/* Use-for axis — category + (optional) owned pills. AND'd with
          the Type axis above so picking Podcast + Promote shows podcast
          templates in the promote bucket only. */}
      <FilterPillRow label="Use for">
        <CategoryPill
          label="All"
          active={useForFilter === "all"}
          onClick={() => onUseForFilterChange("all")}
        />
        {TEMPLATE_CATEGORIES.map((c) => (
          <CategoryPill
            key={c.id}
            label={c.label}
            active={useForFilter === c.id}
            onClick={() => onUseForFilterChange(c.id)}
          />
        ))}
        {includeOwnedPills && (
          <>
            <CategoryPill
              label="Created"
              active={useForFilter === "created"}
              onClick={() => onUseForFilterChange("created")}
            />
            <CategoryPill
              label="Purchased"
              active={useForFilter === "purchased"}
              onClick={() => onUseForFilterChange("purchased")}
            />
          </>
        )}
      </FilterPillRow>
    </div>
  );
}

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
