import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { ToolCard } from "@/components/ToolCard";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { CategoryFilterBar } from "@/components/CategoryFilterBar";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import {
  TOOLS_CATALOG,
  audienceForRole,
  isToolInAudience,
  type ToolAudience,
  type ToolCatalogEntry,
  type ToolCategory,
  type ToolTier,
} from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";

type TierFilter = "all" | ToolTier;
type AudienceFilter = "for_me" | "all" | ToolAudience;
type CategoryFilter = "all" | ToolCategory;

// Order categories in the chip row by how broadly applicable they are
// — Resume tops the list because most users start there, Extension
// tails because the extension is a launcher more than a tool.
const CATEGORY_ORDER: ToolCategory[] = [
  "Resume",
  "Job",
  "Profile",
  "Career",
  "Interview",
  "Salary",
  "Application",
  "Extension",
];

function parseCategoryFilter(raw: string | null): CategoryFilter {
  if (!raw) return "all";
  if (raw === "all") return "all";
  if ((CATEGORY_ORDER as string[]).includes(raw)) return raw as ToolCategory;
  return "all";
}

const TIER_OPTIONS = [
  { value: "free", labelKey: "labels.free" },
  { value: "pro", labelKey: "labels.paid" },
];

const AUDIENCE_OPTIONS = [
  { value: "for_me", labelKey: "labels.tools.audienceForMe" },
  { value: "job_seeker", labelKey: "labels.tools.audienceJobSeekers" },
  { value: "recruiter_employer", labelKey: "labels.tools.audienceRecruitersEmployers" },
  { value: "all", labelKey: "labels.tools.audienceShowAll" },
];

function parseAudienceFilter(raw: string | null): AudienceFilter {
  if (
    raw === "for_me" ||
    raw === "all" ||
    raw === "job_seeker" ||
    raw === "recruiter_employer"
  ) {
    return raw;
  }
  return "for_me";
}

/**
 * The full AI-tools browse experience — audience / tier / category chip
 * filters, a Scroll / Grid / Table view switcher, and the localized,
 * filtered tool list. Extracted from Tools.tsx so the SAME experience
 * renders for both the authenticated tools tab and the signed-out
 * marketing page (#consistency) instead of two divergent layouts. All
 * filter state lives in URL params (?audience / ?tier / ?category / ?q)
 * and the view choice persists per-surface via useViewMode, so the
 * component is fully self-contained — no props required.
 *
 * Role-access gating (`canSeeTool`) hides tools the SuperAdmin manifest
 * disables for the viewer's role. Set `roleGated={false}` on surfaces
 * that should showcase the whole catalog regardless of role — e.g. the
 * signed-out marketing page, where the role query is disabled and would
 * otherwise collapse the grid to the JOB_SEEKER defaults.
 */
export function ToolsBrowser({ roleGated = true }: { roleGated?: boolean } = {}) {
  const { t } = useTranslation();
  const effectiveRole = useEffectiveRole();
  const { canSeeTool } = useRoleAccess();

  // Layout switcher for the AI-tools catalog list (Scroll / Grid / Table),
  // matching the Studio landing pattern. Persisted per-surface so the
  // choice survives reloads.
  const [viewMode, setViewMode] = useViewMode(
    "tools.browse",
    "grid",
    BROWSE_VIEW_MODES,
  );

  const [searchParams, setSearchParams] = useSearchParams();
  // Gate at 2 chars via the shared hook so single-keystroke ?q=A
  // doesn't narrow the tools grid to noise.
  const { effective: toolQuery } = useSearchQueryParam();
  const tierParam = searchParams.get("tier") ?? "";
  const tierFilter: TierFilter =
    tierParam === "free" || tierParam === "pro" ? tierParam : "all";
  const audienceFilter = parseAudienceFilter(searchParams.get("audience"));
  const categoryFilter = parseCategoryFilter(searchParams.get("category"));

  const setCategoryFilter = (next: CategoryFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("category");
    else params.set("category", next);
    setSearchParams(params, { replace: true });
  };

  // #472 — audience + tier filters used to live in the PageHeader as
  // select dropdowns via `useHeaderFilters`; category was already a
  // chip row in-page. Filters now agree on chip-row UX (chips scan
  // faster than nested dropdowns), so all three filters live in the
  // same column.
  const setAudienceFilter = (next: AudienceFilter | "all") => {
    const params = new URLSearchParams(searchParams);
    // The "for_me" default is implicit — drop the param when the user
    // hits the For-me chip so URLs stay clean.
    if (next === "for_me") params.delete("audience");
    else params.set("audience", next);
    setSearchParams(params, { replace: true });
  };
  const setTierFilter = (next: TierFilter | "all") => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("tier");
    else params.set("tier", next);
    setSearchParams(params, { replace: true });
  };

  // Resolve the active audience bucket. "for_me" maps the viewer's
  // effective role onto the bucket (job_seeker / recruiter_employer);
  // when the role doesn't bucket cleanly (admin, anonymous), fall back
  // to "all" so the page stays useful instead of going empty.
  const resolvedAudience: ToolAudience | "all" = useMemo(() => {
    if (audienceFilter === "all") return "all";
    if (audienceFilter === "for_me") {
      return audienceForRole(effectiveRole) ?? "all";
    }
    return audienceFilter;
  }, [audienceFilter, effectiveRole]);

  // Tools that pass every filter EXCEPT category. Used both for the
  // visible grid (further narrowed by the active category chip) AND for
  // the per-chip count, so the chips reflect what the user would see if
  // they switched chips — not a stale total.
  const toolsByCategory = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    return TOOLS_CATALOG.filter((tool) => {
      // Role-access hard gate (SuperAdmin per-role override) applies first,
      // before the user-driven audience/tier browse filters (#2038).
      // Skipped on ungated surfaces (e.g. the signed-out marketing page).
      if (roleGated && !canSeeTool(tool.id)) return false;
      if (!isToolInAudience(tool, resolvedAudience)) return false;
      if (tierFilter !== "all" && tool.tier !== tierFilter) return false;
      if (q === "") return true;
      // Search the LOCALIZED copy so a user typing in their language
      // matches what the cards actually show (not the English source).
      const lt = localizeTool(tool, t);
      const haystack =
        `${lt.title} ${lt.description} ${lt.features?.join(" ") ?? ""} ${lt.statusBadge?.label ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [toolQuery, tierFilter, resolvedAudience, t, canSeeTool, roleGated]);

  const categoryCounts = useMemo(() => {
    const map = new Map<ToolCategory, number>();
    for (const tool of toolsByCategory) {
      map.set(tool.category, (map.get(tool.category) ?? 0) + 1);
    }
    return map;
  }, [toolsByCategory]);

  const filteredTools = useMemo(() => {
    if (categoryFilter === "all") return toolsByCategory;
    return toolsByCategory.filter((tool) => tool.category === categoryFilter);
  }, [toolsByCategory, categoryFilter]);

  const isFiltering =
    toolQuery.trim() !== "" ||
    tierFilter !== "all" ||
    audienceFilter !== "for_me" ||
    categoryFilter !== "all";

  // Single card renderer shared by the Grid and Scroll layouts so the
  // card JSX lives in exactly one place (ToolCard). The scroll track
  // wraps each in a fixed-width snap cell at the call site.
  const renderToolCard = (tool: ToolCatalogEntry) => (
    <ToolCard key={tool.id} tool={tool} />
  );

  return (
    <>
      {/* Audience filter — chip row (#472). Counts are not shown
          because the audience axis is mutually exclusive with the
          viewer's effective role; the For-me default already
          resolves to the right bucket. */}
      <CategoryFilterBar
        className="mb-2"
        value={audienceFilter}
        onChange={setAudienceFilter}
        allLabel={t("labels.tools.audienceShowAll")}
        allCount={0}
        hideZeroCounts={false}
        options={AUDIENCE_OPTIONS.filter((o) => o.value !== "all").map((o) => ({
          value: o.value,
          label: t(o.labelKey),
          count: 0,
        }))}
      />

      {/* Tier filter — chip row (#472). Counts elided for the same
          reason: tier is a small enum and counts would be noisy. */}
      <CategoryFilterBar
        className="mb-3"
        value={tierFilter}
        onChange={setTierFilter}
        allLabel={t("labels.tools.anyTier")}
        allCount={0}
        hideZeroCounts={false}
        options={TIER_OPTIONS.map((o) => ({
          value: o.value,
          label: t(o.labelKey),
          count: 0,
        }))}
      />

      {/* Per-chip count reflects the audience+tier+search filters
          applied above so the chips never claim a count the grid
          won't honour. Categories with zero matches drop out. */}
      <CategoryFilterBar
        className="mb-4"
        value={categoryFilter}
        onChange={setCategoryFilter}
        allCount={toolsByCategory.length}
        options={CATEGORY_ORDER.map((cat) => ({
          value: cat,
          label: cat,
          count: categoryCounts.get(cat) ?? 0,
        }))}
      />

      {isFiltering && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            {toolQuery.trim() !== ""
              ? t("messages.tools.countMatch", { count: filteredTools.length })
              : t("messages.tools.count", { count: filteredTools.length })}
            {toolQuery.trim() !== "" && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  &quot;{toolQuery}&quot;
                </span>
              </>
            )}
            {tierFilter !== "all" && (
              <>
                {" "}{t("messages.tools.filterIn")}{" "}
                <span className="font-medium text-foreground">
                  {tierFilter === "free" ? t("labels.free") : t("labels.paid")}
                </span>
              </>
            )}
            {audienceFilter !== "for_me" && (
              <>
                {" "}{t("messages.tools.filterFor")}{" "}
                <span className="font-medium text-foreground">
                  {t(
                    AUDIENCE_OPTIONS.find((o) => o.value === audienceFilter)?.labelKey ??
                      "labels.tools.audienceEveryone",
                  )}
                </span>
              </>
            )}
            {categoryFilter !== "all" && (
              <>
                {" "}{t("messages.tools.filterIn")}{" "}
                <span className="font-medium text-foreground">
                  {categoryFilter}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Unified Tools list — Scroll / Grid / Table. The layout
          switcher sits in the list header (consistent with the
          Studio landing + Resumes browse pages) and is scoped to
          this AI-tools catalog. */}
      <div className="mb-8 sm:mb-12">
        <div className="mb-3 flex items-center justify-end">
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            modes={BROWSE_VIEW_MODES}
          />
        </div>
        {filteredTools.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            <p>{t("messages.tools.noMatch")}</p>
          </div>
        ) : viewMode === "table" ? (
          <ToolsTable tools={filteredTools} />
        ) : viewMode === "scroll" ? (
          <HorizontalScroller itemCount={filteredTools.length}>
            {filteredTools.map((tool) => (
              <div key={tool.id} className="w-72 shrink-0 snap-start">
                {renderToolCard(tool)}
              </div>
            ))}
          </HorizontalScroller>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {filteredTools.map((tool) => renderToolCard(tool))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Dense table layout for the AI-tools catalog — the Table view of the
 * /tools browse switcher. Mirrors the ResumeOwnedTable idiom (border,
 * muted header, hover rows, ghost-button action cell) so the browse
 * surfaces stay visually consistent. Each row deep-links to the tool's
 * canonical href.
 */
function ToolsTable({ tools }: { tools: ToolCatalogEntry[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name", "Name")}</th>
            <th className="px-3 py-2 font-medium">
              {t("labels.category", "Category")}
            </th>
            <th className="px-3 py-2 font-medium">
              {t("labels.description", "Description")}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {t("labels.actions", "Actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {tools.map((rawTool) => {
            const tool = localizeTool(rawTool, t);
            return (
              <tr
                key={tool.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <Link
                    to={tool.href}
                    className="font-medium hover:text-brand-purple"
                  >
                    {tool.title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <ToolCategoryBadge category={tool.category} />
                </td>
                <td className="max-w-md px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-1">{tool.description}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={tool.href}>
                        {t("actions.open", "Open")}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
