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
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { ToolCard } from "@/components/ToolCard";
import { ToolsLearningGrid } from "@/components/ToolsLearningGrid";
import { CategoryFilterBar } from "@/components/CategoryFilterBar";
import LearningPanel from "@/components/courses/LearningPanel";
import MyLearningPanel from "@/components/courses/MyLearningPanel";
import ClassroomsPanel from "@/components/courses/ClassroomsPanel";
import {
  TOOLS_CATALOG,
  audienceForRole,
  isToolInAudience,
  type ToolAudience,
  type ToolCategory,
  type ToolTier,
} from "@/data/tools-catalog";

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
  { value: "free", label: "Free" },
  { value: "pro", label: "Paid" },
];

const AUDIENCE_OPTIONS = [
  { value: "for_me", label: "For me" },
  { value: "job_seeker", label: "For job seekers" },
  { value: "recruiter_employer", label: "For recruiters & employers" },
  { value: "all", label: "Show all" },
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
  const { isAuthenticated, user } = useAuth();
  const effectiveRole = useEffectiveRole();

  // SEO for tools page
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

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
  //   "tools"       — default AI-tool grid
  //   "learning"    — built-in Learning Content Library (browse), competes
  //                   with LinkedIn Learning by being bundled into every plan
  //   "my-learning" — the learner's enrolled + assigned training (#1889)
  //   "classrooms"  — educator/employer cohort hub + progress roll-up (#1890)
  // Learning + plans live under /tools (no separate sidebar item).
  const rawTab = searchParams.get("tab");
  const tabParam =
    rawTab === "learning" || rawTab === "my-learning" || rawTab === "classrooms"
      ? rawTab
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
      if (!isToolInAudience(tool, resolvedAudience)) return false;
      if (tierFilter !== "all" && tool.tier !== tierFilter) return false;
      if (q === "") return true;
      const haystack =
        `${tool.title} ${tool.description} ${tool.features?.join(" ") ?? ""} ${tool.statusBadge?.label ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [toolQuery, tierFilter, resolvedAudience]);

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
                    AI Tools + Learning
                  </span>
                  <GraduationCap className="h-12 w-12 text-brand-purple" />
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Smart Tools and Built-in Courses to Supercharge Your Career
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                  Free AI career tools — resume scoring, ATS optimization,
                  salary benchmarks, interview practice — paired with a
                  built-in learning library covering AI, RAG, prompt
                  engineering, and the must-have skills for the AI era. SCORM
                  1.2 + xAPI tracked with HMAC-signed certificates. No
                  separate license required.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Access All Tools
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button asChild size="lg" variant="outline" className="text-lg px-8">
                    <Link to="/tools/ai-resume-scorer">
                      <Play className="mr-2 h-5 w-5" />
                      Try Free Tool
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
                  AI Career Tools + Built-in Courses
                </h2>
                <p className="text-center text-muted-foreground mb-8 sm:mb-12 max-w-3xl mx-auto">
                  Free single-purpose AI tools and a bundled learning library —
                  side by side. Score your resume in seconds, then go deeper
                  with courses on AI, RAG, and the must-have skills employers
                  are hiring for. No separate license required.
                </p>
                <ToolsLearningGrid tools={TOOLS_CATALOG} courseLimit={12} />
              </div>

              {/* Stats Section */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">10+</div>
                  <p className="text-sm text-muted-foreground">
                    AI-powered tools
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    1M+
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Resumes analyzed
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    95%
                  </div>
                  <p className="text-sm text-muted-foreground">Accuracy rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    SCORM
                  </div>
                  <p className="text-sm text-muted-foreground">
                    1.2 + xAPI learning library included
                  </p>
                </div>
              </div>

          {/* How It Works */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12">
              How Our AI Tools Work
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">1. Upload Content</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your resume, job description, or input
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">2. AI Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Our AI processes and analyzes your content
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">3. Get Insights</h3>
                <p className="text-sm text-muted-foreground">
                  Receive detailed feedback and recommendations
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">4. Improve & Succeed</h3>
                <p className="text-sm text-muted-foreground">
                  Apply insights to enhance your career
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
                  New: Resume Sentiment Analysis
                </h2>
                <p className="text-xl text-muted-foreground">
                  Discover how positive your resume sounds to employers with our
                  AI-powered sentiment analysis tool
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-pink-600 mb-2">
                    85%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Analysis Accuracy
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    40%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    More Interview Invites
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    0-100
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sentiment Score Range
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
                    Try Sentiment Analysis Free
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Success Stories */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12">
              Tool Success Stories
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
                    "The Resume Optimizer helped me increase my callback rate by
                    300%. The AI suggestions were spot-on and helped me tailor
                    my resume for each application."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Jennifer Liu</p>
                      <p className="text-xs text-muted-foreground">
                        Data Analyst
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
                    "The Interview Simulator gave me the confidence I needed. I
                    practiced for weeks and nailed my dream job interview. The
                    feedback was incredibly detailed."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Carlos Martinez</p>
                      <p className="text-xs text-muted-foreground">
                        Software Engineer
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
                    "I never realized my resume sounded so negative! The
                    sentiment analysis showed me exactly what to change. After
                    improving my score from 35 to 78, I started getting way more
                    interview calls."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Sarah Chen</p>
                      <p className="text-xs text-muted-foreground">
                        Marketing Manager
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
              Tools to fix it. Courses to learn it.
            </h3>
            <p className="text-muted-foreground mb-6">
              Sharpen your resume in seconds with our AI tools, then go deeper
              with built-in courses on AI, RAG, and the must-have skills
              employers are hiring for now — all on one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Get Started Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/courses/e064d488-0b47-bcc7-d0c8-572f9c61cb3c/ai-era-must-have-skills">
                <Button size="lg" variant="outline">
                  <GraduationCap className="mr-2 h-5 w-5" />
                  Browse AI-Era Skills Course
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
                { key: "tools", label: "Tools", icon: Wrench, to: "/tools" },
                { key: "learning", label: "Learning", icon: GraduationCap, to: "/tools?tab=learning" },
                { key: "my-learning", label: "My Learning", icon: GraduationCap, to: "/tools?tab=my-learning" },
                { key: "classrooms", label: "Classrooms", icon: Users, to: "/tools?tab=classrooms" },
              ]}
              activeTabKey={tabParam}
              search={<HeaderSearch />}
            />

            {tabParam === "learning" ? (
              <LearningPanel />
            ) : tabParam === "my-learning" ? (
              <MyLearningPanel />
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
              allLabel="Show all"
              allCount={0}
              hideZeroCounts={false}
              options={AUDIENCE_OPTIONS.filter((o) => o.value !== "all").map((o) => ({
                value: o.value,
                label: o.label,
                count: 0,
              }))}
            />

            {/* Tier filter — chip row (#472). Counts elided for the same
                reason: tier is a small enum and counts would be noisy. */}
            <CategoryFilterBar
              className="mb-3"
              value={tierFilter}
              onChange={setTierFilter}
              allLabel="Any tier"
              allCount={0}
              hideZeroCounts={false}
              options={TIER_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
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
                  {filteredTools.length} tool
                  {filteredTools.length === 1 ? "" : "s"}
                  {toolQuery.trim() !== "" && (
                    <>
                      {" "}match
                      {filteredTools.length === 1 ? "es" : ""}{" "}
                      <span className="font-medium text-foreground">
                        &quot;{toolQuery}&quot;
                      </span>
                    </>
                  )}
                  {tierFilter !== "all" && (
                    <>
                      {" "}in{" "}
                      <span className="font-medium text-foreground">
                        {tierFilter === "free" ? "Free" : "Paid"}
                      </span>
                    </>
                  )}
                  {audienceFilter !== "for_me" && (
                    <>
                      {" "}for{" "}
                      <span className="font-medium text-foreground">
                        {AUDIENCE_OPTIONS.find((o) => o.value === audienceFilter)?.label ?? "everyone"}
                      </span>
                    </>
                  )}
                  {categoryFilter !== "all" && (
                    <>
                      {" "}in{" "}
                      <span className="font-medium text-foreground">
                        {categoryFilter}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Unified Tools Grid */}
            <div className="mb-8 sm:mb-12">
              {filteredTools.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                  <p>No tools match the current filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
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

