// Shared template-card list. Used by both StudioWizard (step 0, 2-col grid)
// and StudioSidebar (left rail, 1-col, fixed-height scroll).
//
// Single component owns:
//  - selected highlight + check icon
//  - layout (responsive: 1-col on narrow, 2-col on wider)
//  - optional fixed-height scrolling for the sidebar variant
//  - card markup so the wizard and sidebar can never drift
//  - a per-row (i) info affordance that surfaces template details — the
//    button self-gates between routing and opening a Sheet via
//    TemplateDetailsHost, so we don't pass any onShowDetails / canShowSheet
//    props down

import { Check } from "lucide-react";
import TemplateInfoButton from "@/components/templates/TemplateInfoButton";
import { getStaticTemplateBySlug } from "@/lib/templates/registry";
import { cn } from "@/lib/utils";
import { TEMPLATE_CATALOG, type ContentTemplate, type TemplateDef } from "./catalog";

interface Props {
  selected?: ContentTemplate;
  onSelect: (id: ContentTemplate) => void;
  /**
   * "responsive" → 1 column under sm, 2 columns at sm and up. Default for the
   * wizard. The sidebar uses "fixed-1" to force a single column regardless of
   * width so cards can fit in a narrow rail.
   */
  layout?: "responsive" | "fixed-1";
  /**
   * When set, the list scrolls inside this max-height. Used by the sidebar
   * so the templates section doesn't push the rest of the rail off-screen
   * when the catalog grows. Width is otherwise self-sized.
   */
  scrollMaxHeight?: string;
  /** Override the catalog if a caller wants a custom subset. Defaults to all. */
  templates?: TemplateDef[];
}

/** Convert a catalog TemplateDef into the TemplateMeta the info button
 *  needs. Goes through the registry so any future change to slug/blurb
 *  shape stays in one place. Returns null only if the registry can't
 *  resolve the slug (e.g. a future legacy id) — the row still renders
 *  without the (i) button in that case. */
function resolveMeta(def: TemplateDef) {
  const slug = def.id.replace(/_/g, "-");
  return getStaticTemplateBySlug(slug);
}

export default function TemplateList({
  selected,
  onSelect,
  layout = "responsive",
  scrollMaxHeight,
  templates = TEMPLATE_CATALOG,
}: Props) {
  const gridClass =
    layout === "fixed-1"
      ? "grid grid-cols-1 gap-1.5"
      : "grid grid-cols-1 sm:grid-cols-2 gap-2";

  const ulStyle = scrollMaxHeight
    ? { maxHeight: scrollMaxHeight, overflowY: "auto" as const }
    : undefined;

  return (
    <ul className={cn(gridClass, scrollMaxHeight && "pr-0.5")} style={ulStyle}>
      {templates.map((tmpl) => {
        const isActive = selected === tmpl.id;
        const Icon = tmpl.icon;
        const meta = resolveMeta(tmpl);
        return (
          <li key={tmpl.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(tmpl.id)}
              className={cn(
                "w-full text-left flex flex-col gap-1.5 rounded-lg border transition-colors",
                layout === "fixed-1" ? "px-2.5 py-2" : "px-3 py-3",
                // Reserve space on the right for the absolutely-positioned
                // info button so the label never collides with the icon.
                meta && (layout === "fixed-1" ? "pr-8" : "pr-10"),
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-accent",
              )}
              aria-pressed={isActive}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "shrink-0",
                    layout === "fixed-1" ? "w-4 h-4" : "w-5 h-5",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "font-semibold",
                    layout === "fixed-1" ? "text-xs" : "text-sm",
                    isActive && "text-primary",
                  )}
                >
                  {tmpl.label}
                </span>
                {isActive && (
                  <Check
                    className={cn(
                      "ml-auto shrink-0 text-primary",
                      layout === "fixed-1" ? "w-3 h-3" : "w-4 h-4",
                    )}
                  />
                )}
              </div>
              <p
                className={cn(
                  "text-muted-foreground leading-snug",
                  layout === "fixed-1" ? "text-[10px]" : "text-[11px]",
                )}
              >
                {tmpl.desc}
              </p>
            </button>

            {/* Info icon — opens the details Sheet/route depending on the
                surrounding TemplateDetailsHostProvider. Lives outside the
                select button so a click on the (i) doesn't also pick the
                template. */}
            {meta && (
              <div
                className={cn(
                  "absolute top-1.5",
                  layout === "fixed-1" ? "right-1" : "right-1.5",
                )}
              >
                <TemplateInfoButton
                  meta={meta}
                  className={cn(
                    layout === "fixed-1" ? "h-6 w-6" : "h-7 w-7",
                  )}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
