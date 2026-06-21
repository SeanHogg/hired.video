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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  // Both axes used to render as two wrapping rows of pills (~12 + ~11
  // buttons) — overwhelming on the chooser. Collapsed into two compact
  // dropdowns (#studio-filters): the selected value reads on the trigger,
  // the full option set lives one click away. Same two axes, same AND
  // predicate, far less visual noise. The Wizard mounts this too, so the
  // condensed control rolls out to both surfaces (DRY).
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Type axis — MediaKind. Reads MEDIA_KINDS so adding a kind
          (#894 phases 4/5) doesn't touch the consumer files. */}
      <Select
        value={kindFilter}
        onValueChange={(v) => onKindFilterChange(v as TemplateKindFilter)}
      >
        <SelectTrigger className="h-9 w-auto min-w-[7.5rem] gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Type
          </span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {MEDIA_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {MEDIA_KIND_UI[kind].badgeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Use-for axis — category + (optional) owned options. AND'd with
          the Type axis so picking Podcast + Promote shows podcast
          templates in the promote bucket only. */}
      <Select
        value={useForFilter}
        onValueChange={(v) => onUseForFilterChange(v as TemplateUseForFilter)}
      >
        <SelectTrigger className="h-9 w-auto min-w-[7.5rem] gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Use for
          </span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {TEMPLATE_CATEGORIES.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
          {includeOwnedPills && (
            <>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="purchased">Purchased</SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
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
