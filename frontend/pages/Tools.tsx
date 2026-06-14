import {
  Wrench,
  ArrowRight,
  Star,
  Brain,
  FileText,
  BarChart3,
  Play,
  TrendingUp,
  Heart,
  GraduationCap,
  Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { ToolCard } from "@/components/ToolCard";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { ToolsLearningGrid } from "@/components/ToolsLearningGrid";
import { CategoryFilterBar } from "@/components/CategoryFilterBar";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import LearningPanel, { LEARNING_VIEW_MODES } from "@/components/courses/LearningPanel";
import ClassroomsPanel from "@/components/courses/ClassroomsPanel";
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

export default function Tools() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const effectiveRole = useEffectiveRole();
  const { canSeeTool } = useRoleAccess();

  // SEO for tools page
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

  // Layout switcher for the AI-tools catalog list (Scroll / Grid / Table),
  // matching the Studio landing pattern. Persisted per-surface so the
  // choice survives reloads. Scoped to the default "tools" tab; the
  // learning + classrooms tabs render their own panels.
  const [viewMode, setViewMode] = useViewMode(
    "tools.browse",
    "grid",
    BROWSE_VIEW_MODES,
  );

  // Learning sub-tab's layout switcher. Lifted up here (instead of living
  // inside LearningPanel) so the toggle can render next to the global search
  // in PageHeader's actions slot, while the panel below consumes the same
  // controlled state. Same persisted key as before so the choice survives.
  const [learningView, setLearningView] = useViewMode(
    "tools.learning",
    "grid",
    LEARNING_VIEW_MODES,
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
  // Sub-tab on /tools:
  //   "tools"      — default AI-tool grid
  //   "learning"   — consolidated learning home: your in-progress + assigned
  //                  training AND the built-in Content Library in one unified,
  //                  in-progress-first list (Scroll / Card / Table), plus a
  //                  goal + join-classroom sidebar. Competes with LinkedIn
  //                  Learning by being bundled into every plan.
  //   "classrooms" — educator/employer cohort hub + progress roll-up (#1890)
  // The old "my-learning" tab (#1889) was folded into "learning"; the param
  // is still honoured as an alias so existing links/notifications resolve.
  // Learning + plans live under /tools (no separate sidebar item).
  const rawTab = searchParams.get("tab");
  const tabParam =
    rawTab === "learning" || rawTab === "my-learning"
      ? "learning"
      : rawTab === "classrooms"
        ? "classrooms"
        : "tools";

  // #1401 — outside the default Tools grid the AI-tool filter params
  // (audience / tier / category) are irrelevant; the chip rows that set
  // them aren't rendered either. Scrub them from the URL on tab switch so
  // the URL never carries stale state that nothing reads.
  useEffect(() => {
    if (tabParam === "tools") return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    for (const key of ["audience", "tier", "category"] as const) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [tabParam, searchParams, setSearchParams]);

  const setCategoryFilter = (next: CategoryFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("category");
    else params.set("category", next);
    setSearchParams(params, { replace: true });
  };

  // #472 — audience + tier filters used to live in the PageHeader as
  // select dropdowns via `useHeaderFilters`; category was already a
  // chip row in-page. Filters now agree on chip-row UX (chips scan
  // faster than nested dropdowns), so the header-filter slot for
  // /tools is empty and all three filters live in the same column.
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
      if (!canSeeTool(tool.id)) return false;
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
  }, [toolQuery, tierFilter, resolvedAudience, t, canSeeTool]);

  const categoryCounts = useMemo(() => {
    const map = new Map<ToolCategory, number>();
    for (const t of toolsByCategory) {
      map.set(t.category, (map.get(t.category) ?? 0) + 1);
    }
    return map;
  }, [toolsByCategory]);

  const filteredTools = useMemo(() => {
    if (categoryFilter === "all") return toolsByCategory;
    return toolsByCategory.filter((t) => t.category === categoryFilter);
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

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <AppShell>
        <div className="px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-3 mb-6">
                  <div className="relative">
                    <Wrench className="h-12 w-12 text-primary" />
                    <Brain className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    {t("headings.tools.aiToolsLearning")}
                  </span>
                  <GraduationCap className="h-12 w-12 text-brand-purple" />
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  {t("headings.tools.heroTitle")}
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                  {t("messages.tools.heroDescription")}
                </p>
                <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
                  {t("messages.tools.heroEducators")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      {t("actions.accessAllTools")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button asChild size="lg" variant="outline" className="text-lg px-8">
                    <Link to="/tools/ai-resume-scorer">
                      <Play className="mr-2 h-5 w-5" />
                      {t("actions.tryFreeTool")}
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Intermixed Tools + Learning grid — surfaced directly under
                  the hero (ahead of the stats band) so signed-out visitors
                  see BOTH the AI tools and the bundled course library in the
                  first row, above the fold. Previously tools and courses
                  lived in two stacked sections and the course section sat
                  below the fold where visitors never scrolled. The grid
                  forces a course into the second slot on every breakpoint —
                  see ToolsLearningGrid. */}
              <div className="mb-12 sm:mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
                  {t("headings.tools.careerToolsCourses")}
                </h2>
                <p className="text-center text-muted-foreground mb-8 sm:mb-12 max-w-3xl mx-auto">
                  {t("messages.tools.careerToolsCoursesDesc")}
                </p>
                <ToolsLearningGrid tools={TOOLS_CATALOG} courseLimit={12} />
              </div>

              {/* Stats Section */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">10+</div>
                  <p className="text-sm text-muted-foreground">
                    {t("labels.tools.statAiTools")}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    1M+
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("labels.tools.statResumesAnalyzed")}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    95%
                  </div>
                  <p className="text-sm text-muted-foreground">{t("labels.tools.statAccuracyRate")}</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    SCORM
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("labels.tools.statScormLibrary")}
                  </p>
                </div>
              </div>

          {/* How It Works */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12">
              {t("headings.tools.howItWorks")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{t("headings.tools.step1Title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("messages.tools.step1Desc")}
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{t("headings.tools.step2Title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("messages.tools.step2Desc")}
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{t("headings.tools.step3Title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("messages.tools.step3Desc")}
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{t("headings.tools.step4Title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("messages.tools.step4Desc")}
                </p>
              </div>
            </div>
          </div>

          {/* Feature Spotlight - Sentiment Analysis */}
          <div className="mb-16">
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-100">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-8 w-8 text-pink-600" />
                </div>
                <h2 className="text-3xl font-bold mb-4">
                  {t("headings.tools.sentimentTitle")}
                </h2>
                <p className="text-xl text-muted-foreground">
                  {t("messages.tools.sentimentDesc")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-pink-600 mb-2">
                    85%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("labels.tools.sentimentAccuracy")}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    40%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("labels.tools.sentimentMoreInvites")}
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    0-100
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("labels.tools.sentimentScoreRange")}
                  </p>
                </div>
              </div>

              <div className="text-center">
                <Link to="/tools/sentiment-analysis">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90"
                  >
                    <Heart className="mr-2 h-5 w-5" />
                    {t("actions.trySentimentFree")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Success Stories */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12">
              {t("headings.tools.successStories")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm mb-4">
                    {t("messages.tools.testimonial1")}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Jennifer Liu</p>
                      <p className="text-xs text-muted-foreground">
                        {t("labels.tools.testimonial1Role")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm mb-4">
                    {t("messages.tools.testimonial2")}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Carlos Martinez</p>
                      <p className="text-xs text-muted-foreground">
                        {t("labels.tools.testimonial2Role")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm mb-4">
                    {t("messages.tools.testimonial3")}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Sarah Chen</p>
                      <p className="text-xs text-muted-foreground">
                        {t("labels.tools.testimonial3Role")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
            <h3 className="text-2xl font-bold mb-4">
              {t("headings.tools.ctaTitle")}
            </h3>
            <p className="text-muted-foreground mb-6">
              {t("messages.tools.ctaDesc")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  {t("actions.getStartedToday")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/courses/e064d488-0b47-bcc7-d0c8-572f9c61cb3c/ai-era-must-have-skills">
                <Button size="lg" variant="outline">
                  <GraduationCap className="mr-2 h-5 w-5" />
                  {t("actions.browseAiEraCourse")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // If user is authenticated, show the actual tools page
  return (
    <AppShell bgClassName="bg-background">
      <div className="p-4 md:p-6">
          <div>
            <PageHeader
              tabs={[
                { key: "tools", label: t("labels.tools.tabTools"), icon: Wrench, to: "/tools" },
                { key: "learning", label: t("labels.tools.tabLearning"), icon: GraduationCap, to: "/tools?tab=learning" },
                { key: "classrooms", label: t("labels.tools.tabClassrooms"), icon: Users, to: "/tools?tab=classrooms" },
              ]}
              activeTabKey={tabParam}
              search={<HeaderSearch />}
              actions={
                tabParam === "learning" ? (
                  <ViewModeToggle
                    value={learningView}
                    onChange={setLearningView}
                    modes={LEARNING_VIEW_MODES}
                  />
                ) : undefined
              }
            />

            {tabParam === "learning" ? (
              <LearningPanel view={learningView} onViewChange={setLearningView} />
            ) : tabParam === "classrooms" ? (
              <ClassroomsPanel />
            ) : (
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
            )}
          </div>
        </div>
    </AppShell>
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

