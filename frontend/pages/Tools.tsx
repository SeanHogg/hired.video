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
import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { ToolsBrowser } from "@/components/ToolsBrowser";
import ViewModeToggle from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import LearningPanel, { LEARNING_VIEW_MODES } from "@/components/courses/LearningPanel";
import ClassroomsPanel from "@/components/courses/ClassroomsPanel";

export default function Tools() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // SEO for tools page
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

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

              {/* Filterable tools + courses browser — the SAME audience /
                  tier / category chips + Scroll / Grid / Table view switcher
                  the authenticated tools tab renders, so signed-out visitors
                  get the identical browse experience (consistency) and can
                  filter the catalog before signing up. `weaveCourses` intermixes
                  the learning-library courses through the grid so both content
                  kinds stay visible above the fold (the page is built around
                  that); `roleGated={false}` showcases the whole catalog since
                  the role query is disabled for anonymous visitors. Shares
                  ToolsBrowser with the authenticated path so the filter +
                  weave logic lives in one place. */}
              <div className="mb-12 sm:mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">
                  {t("headings.tools.careerToolsCourses")}
                </h2>
                <p className="text-center text-muted-foreground mb-8 sm:mb-12 max-w-3xl mx-auto">
                  {t("messages.tools.careerToolsCoursesDesc")}
                </p>
                <ToolsBrowser roleGated={false} weaveCourses courseLimit={12} />
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
              <ToolsBrowser />
            )}
          </div>
        </div>
    </AppShell>
  );
}

