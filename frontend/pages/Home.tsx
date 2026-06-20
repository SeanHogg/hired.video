import React, { useCallback, useEffect, useState } from "react";
import { ZodError } from "zod";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowRight,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Video as VideoIcon,
  CheckCircle2,
  Star,
  FileText,
  Eye,
  Clapperboard,
  Headphones,
  Gamepad2,
  GraduationCap,
  Users,
  ClipboardCheck,
} from "lucide-react";

import UnifiedSearch from "@/components/UnifiedSearch";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import { ToolCard } from "@/components/ToolCard";
import { getToolsForHome } from "@/data/tools-catalog";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { useTemplates } from "@/lib/templates/registry";
import type { TemplateMeta } from "@/lib/templates/types";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useAuth } from "@/lib/auth";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import useDashboard from "@/hooks/dashboard/useDashboard";
import ReferralBanner from "@/components/ReferralBanner";
import EarnHubBanner from "@/components/EarnHubBanner";

// Shared dashboard components (used in feed sidebar)
import QuickActions from "@/components/dashboard/shared/QuickActions";
import ActivityFeed from "@/components/dashboard/shared/ActivityFeed";
import OnboardingProgress from "@/components/dashboard/shared/OnboardingProgress";
import WelcomeHero from "@/components/dashboard/shared/WelcomeHero";

// Feed data + components (reused from Feed.tsx)
import { getFeedPosts, searchFeedPosts } from "@/lib/services/feed-service";
import type {
  FeedPost,
  FeedPostsResponse,
  GetFeedPostsRequest,
  FeedFilters,
} from "@/types/feed";
import FeedPostCard from "@/components/feed/FeedPostCard";
import CreatePostModal from "@/components/feed/CreatePostModal";
import FeedProfileCard from "@/components/feed/FeedProfileCard";
import {
  PostComposerBar,
  FeedFilterTabs,
  FeedRightPanel,
} from "@/pages/Feed";

type PostMode = "text" | "video" | "photo" | "article";

// ─── Unauthenticated marketing page ──────────────────────────────────────────
function HomeMarketingPage() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

  const HOME_STATS = [
    { stat: "500K+", label: t("marketing.home.stats.tracking") },
    { stat: "3×", label: t("marketing.home.stats.moreInterviews") },
    { stat: "60s", label: t("marketing.home.stats.avgTime") },
    { stat: "24/7", label: t("marketing.home.stats.coach") },
  ];

  const HOME_FEATURES = [
    {
      icon: VideoIcon,
      title: t("marketing.home.feature.dashboard.title"),
      description: t("marketing.home.feature.dashboard.desc"),
      bullets: [
        t("marketing.home.feature.dashboard.bullet1"),
        t("marketing.home.feature.dashboard.bullet2"),
        t("marketing.home.feature.dashboard.bullet3"),
      ],
      border: "border-brand-purple/20 hover:border-brand-purple/40",
      iconColor: "text-brand-purple",
    },
    {
      icon: Sparkles,
      title: t("marketing.home.feature.nextAction.title"),
      description: t("marketing.home.feature.nextAction.desc"),
      bullets: [
        t("marketing.home.feature.nextAction.bullet1"),
        t("marketing.home.feature.nextAction.bullet2"),
        t("marketing.home.feature.nextAction.bullet3"),
      ],
      border: "border-brand-blue/20 hover:border-brand-blue/40",
      iconColor: "text-brand-blue",
    },
    {
      icon: MessageSquare,
      title: t("marketing.home.feature.community.title"),
      description: t("marketing.home.feature.community.desc"),
      bullets: [
        t("marketing.home.feature.community.bullet1"),
        t("marketing.home.feature.community.bullet2"),
        t("marketing.home.feature.community.bullet3"),
      ],
      border: "border-primary/20 hover:border-primary/40",
      iconColor: "text-primary",
    },
  ];

  const HOME_HOW_IT_WORKS = [
    { icon: FileText, step: t("marketing.home.step.signup.title"), desc: t("marketing.home.step.signup.desc") },
    { icon: Sparkles, step: t("marketing.home.step.build.title"), desc: t("marketing.home.step.build.desc") },
    { icon: Eye, step: t("marketing.home.step.track.title"), desc: t("marketing.home.step.track.desc") },
    { icon: TrendingUp, step: t("marketing.home.step.land.title"), desc: t("marketing.home.step.land.desc") },
  ];

  const HOME_TESTIMONIALS = [
    { quote: t("marketing.home.testimonial1.quote"), name: t("marketing.home.testimonial1.name"), title: t("marketing.home.testimonial1.title") },
    { quote: t("marketing.home.testimonial2.quote"), name: t("marketing.home.testimonial2.name"), title: t("marketing.home.testimonial2.title") },
    { quote: t("marketing.home.testimonial3.quote"), name: t("marketing.home.testimonial3.name"), title: t("marketing.home.testimonial3.title") },
  ];

  const HOME_FAQ = [
    { question: t("faq.home.whatQ"), answer: t("faq.home.whatA") },
    { question: t("faq.home.freeQ"), answer: t("faq.home.freeA") },
    { question: t("faq.home.whoQ"), answer: t("faq.home.whoA") },
    { question: t("faq.home.linkedinQ"), answer: t("faq.home.linkedinA") },
    { question: t("faq.home.cameraQ"), answer: t("faq.home.cameraA") },
    { question: t("faq.home.atsQ"), answer: t("faq.home.atsA") },
    { question: t("faq.home.privateQ"), answer: t("faq.home.privateA") },
    { question: t("faq.home.startQ"), answer: t("faq.home.startA") },
  ];

  return (
    <AppShell>
      <main>
        <div className="px-4 py-16">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <TrendingUp className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("marketing.home.brandTagline")}
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                {t("marketing.home.heroTitle")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t("marketing.home.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.getStartedFree")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    {t("actions.signIn")}
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("marketing.home.freeForever")}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {HOME_STATS.map((s) => (
                <div key={s.stat} className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {s.stat}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Discover — the SAME unified search control the homepage root (/)
           * renders (see Index.tsx), so the dashboard and home share ONE
           * search surface — card | list | scroll views + every category +
           * pagination — instead of a parallel preview panel. Self-contained:
           * reads/writes ?q & ?category on the URL. */}
          <UnifiedSearch />

          <div className="px-4 pb-16 pt-8">
            {/* Features */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                {t("marketing.home.featuresTitle")}
              </h2>
              <p className="text-center text-muted-foreground mb-12">
                {t("marketing.home.featuresSubtitle")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {HOME_FEATURES.map(
                  ({ icon: Icon, title, description, bullets, border, iconColor }) => (
                    <Card
                      key={title}
                      className={`${border} transition-colors`}
                    >
                      <CardHeader>
                        <Icon className={`h-10 w-10 ${iconColor} mb-4`} />
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          {bullets.map((b) => (
                            <div key={b} className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              {b}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ),
                )}
              </div>
            </div>

            {/* How It Works */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.home.howItWorks")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {HOME_HOW_IT_WORKS.map(({ icon: Icon, step, desc }) => (
                  <div key={step} className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{step}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tool highlights — rendered from the shared tools catalog via
                the same ToolCard used on the Tools page, so adding a tool in
                one place surfaces it everywhere. */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                {t("marketing.home.toolsTitle")}
              </h2>
              <p className="text-center text-muted-foreground mb-12">
                {t("marketing.home.toolsSubtitle")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                {getToolsForHome().map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
              {/* Built-in learning library teaser — keeps the home page
                  surface lean (no new section) while still planting the
                  flag against LinkedIn Learning's ~$379/seat/yr SKU.
                  /learning redirects to /tools?tab=learning. */}
              <div className="mt-10 text-center">
                <Link
                  to="/learning"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  {t("marketing.home.learningLibraryTeaser")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Creator Studio — one canvas, every media kind. Surfaces the
                multi-kind studio story (video/NLE, podcast, comic, game,
                animation) the tool grid above doesn't carry. Links into
                the live /studio surface. Only shippable kinds are pitched
                (image / cad / 3d-model are roadmap — KIND_MARKETING). */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                {t("marketing.home.studioTitle")}
              </h2>
              <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
                {t("marketing.home.studioSubtitle")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Clapperboard,
                    iconColor: "text-brand-purple",
                    border: "border-brand-purple/20 hover:border-brand-purple/40",
                    title: t("marketing.home.studio.video.title"),
                    desc: t("marketing.home.studio.video.desc"),
                  },
                  {
                    icon: Headphones,
                    iconColor: "text-violet-600",
                    border: "border-violet-500/20 hover:border-violet-500/40",
                    title: t("marketing.home.studio.audio.title"),
                    desc: t("marketing.home.studio.audio.desc"),
                  },
                  {
                    icon: Gamepad2,
                    iconColor: "text-fuchsia-600",
                    border: "border-fuchsia-500/20 hover:border-fuchsia-500/40",
                    title: t("marketing.home.studio.interactive.title"),
                    desc: t("marketing.home.studio.interactive.desc"),
                  },
                ].map(({ icon: Icon, iconColor, border, title, desc }) => (
                  <Card key={title} className={`${border} transition-colors`}>
                    <CardHeader>
                      <Icon className={`h-10 w-10 ${iconColor} mb-4`} />
                      <CardTitle className="text-lg">{title}</CardTitle>
                      <CardDescription>{desc}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              <div className="mt-10 text-center">
                <Link to="/studio">
                  <Button variant="outline">
                    {t("marketing.home.studioCta")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Whole-platform strip — the home page is candidate-first, so
                this single block plants the flag that hired.video also
                carries Learning, People Operations, and structured
                recruiting. Deep-links to the Features page for the full
                story rather than expanding the home surface. */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                {t("marketing.home.platformTitle")}
              </h2>
              <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
                {t("marketing.home.platformSubtitle")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: GraduationCap,
                    iconColor: "text-brand-blue",
                    title: t("marketing.home.platform.learning.title"),
                    desc: t("marketing.home.platform.learning.desc"),
                  },
                  {
                    icon: Users,
                    iconColor: "text-emerald-600",
                    title: t("marketing.home.platform.peopleOps.title"),
                    desc: t("marketing.home.platform.peopleOps.desc"),
                  },
                  {
                    icon: ClipboardCheck,
                    iconColor: "text-amber-600",
                    title: t("marketing.home.platform.recruiting.title"),
                    desc: t("marketing.home.platform.recruiting.desc"),
                  },
                ].map(({ icon: Icon, iconColor, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <Icon className={`h-8 w-8 ${iconColor} shrink-0 mt-0.5`} />
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 text-center">
                <Link
                  to="/features"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  {t("marketing.home.platformCta")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Templates — pulled from the unified registry so creator-
                published templates surface alongside the in-house
                presets. Each card links to /marketplace/templates/<slug>,
                the per-template SEO page where the Use / Preview CTA
                lives. Sync content (resume + studio-builtin) paints
                instantly; creator templates merge in once their
                listPublic() fetch resolves. */}
            <MarketingTemplateStrip />
            <div className="mb-16 -mt-8 text-center">
              <Link
                to="/search?category=templates"
                className="inline-flex items-center text-sm font-medium text-primary hover:underline"
              >
                {t("marketing.home.templatesBrowseAll")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>

            {/* Testimonials */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.home.testimonialsTitle")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {HOME_TESTIMONIALS.map((t) => (
                  <Card key={t.name}>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">&ldquo;{t.quote}&rdquo;</p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.title}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="home"
            subheading={t("marketing.home.faqSubheading")}
            items={HOME_FAQ}
          />

          {/* Final CTA */}
          <div className="px-4 py-16">
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
              <h3 className="text-3xl font-bold mb-4">
                {t("marketing.home.ctaTitle")}
              </h3>
              <p className="text-muted-foreground mb-8">
                {t("marketing.home.ctaSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    {t("actions.getStartedFree")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline">
                    {t("actions.viewPricing")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
      </main>
    </AppShell>
  );
}

// ─── Authenticated Home: Dashboard widgets + Feed in one page ────────────────
export default function Home() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const effectiveRole = useEffectiveRole();

  // Dashboard state
  const {
    dashboardData,
    loading: dashboardLoading,
  } = useDashboard();

  // Feed state
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [filters, setFilters] = useState<FeedFilters>({
    searchTerm: "",
    filter: "all",
    privacy: "public",
  });
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [createPostMode, setCreatePostMode] = useState<PostMode>("text");

  const loadFeedPosts = useCallback(
    async (page = 1, append = false) => {
      try {
        setFeedLoading(true);
        setFeedError(null);

        const request: GetFeedPostsRequest = {
          searchTerm: filters.searchTerm || undefined,
          filter: filters.filter === "all" ? undefined : filters.filter,
          privacy: filters.privacy,
          pageNumber: page,
          pageSize: 10,
        };

        let response: FeedPostsResponse;
        if (filters.searchTerm) {
          response = await searchFeedPosts(filters.searchTerm, page, 10);
        } else {
          response = await getFeedPosts(request);
        }

        if (append) {
          setPosts((prev) => [...prev, ...response.posts]);
        } else {
          setPosts(response.posts);
        }
        setHasMore(response.hasNextPage);
        setPageNumber(page);
      } catch (err) {
        setFeedError(
          err instanceof ZodError
            ? t("errors.feedLoadFailed")
            : err instanceof Error
              ? err.message
              : t("errors.feedPostsLoadFailed"),
        );
      } finally {
        setFeedLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    if (isAuthenticated) loadFeedPosts(1, false);
  }, [isAuthenticated, filters, loadFeedPosts]);

  const handlePostCreated = useCallback(() => {
    setCreatePostOpen(false);
    loadFeedPosts(1, false);
  }, [loadFeedPosts]);

  const handlePostLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLikedByCurrentUser: !post.isLikedByCurrentUser,
              likeCount: post.isLikedByCurrentUser
                ? post.likeCount - 1
                : post.likeCount + 1,
            }
          : post,
      ),
    );
  }, []);

  const handlePostDelete = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const handlePostEdit = useCallback(
    (postId: string, updatedPost: FeedPost) => {
      setPosts((prev) =>
        prev.map((post) => (post.id === postId ? updatedPost : post)),
      );
    },
    [],
  );

  const handlePostHide = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const openCreate = useCallback((mode: PostMode) => {
    setCreatePostMode(mode);
    setCreatePostOpen(true);
  }, []);

  // Auth loading
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">{t("status.loading")}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Unauthenticated → marketing page
  if (!isAuthenticated || !user) {
    return <HomeMarketingPage />;
  }

  // ─── Authenticated view: Dashboard section → Feed section ───────────────
  return (
    <AppShell bgClassName="bg-muted/30">
        <div className="pb-20">
          {/* ── Feed section ── */}
          <div className="px-4 py-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                {t("headings.yourFeed")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("messages.feedTagline")}
              </p>
            </div>

            <EarnHubBanner />
            <ReferralBanner />

            <div className="grid grid-cols-1 lg:grid-cols-[225px_1fr_280px] gap-6 items-start">
              {/* LEFT — Profile card + Recent Activity */}
              <div className="hidden lg:block sticky top-24 space-y-4">
                <FeedProfileCard user={user as never} />
                <ActivityFeed
                  activities={dashboardData?.recentActivity || []}
                  loading={dashboardLoading}
                  maxItems={5}
                  showViewAll={false}
                />
              </div>

              {/* CENTER — Feed notifications + Post composer + filter tabs + posts */}
              <div className="min-w-0 space-y-4">
                {/* Feed notification items */}
                <WelcomeHero />

                <PostComposerBar user={user as never} onOpen={openCreate} />

                <div className="bg-card rounded-xl overflow-hidden border">
                  <FeedFilterTabs
                    active={filters.filter ?? "all"}
                    onChange={(v) =>
                      setFilters((prev) => ({ ...prev, filter: v }))
                    }
                  />
                </div>

                {feedError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{feedError}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadFeedPosts(1, false)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> {t("actions.retry")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {feedLoading && posts.length === 0 && (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-muted rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 bg-muted rounded w-1/4" />
                              <div className="h-3 bg-muted rounded w-full" />
                              <div className="h-3 bg-muted rounded w-3/4" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!feedLoading && posts.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        {t("messages.feedEmptyTitle")}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        {t("messages.feedEmptyBody")}
                      </p>
                      <Button onClick={() => openCreate("text")}>
                        {t("actions.startPost")}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <FeedPostCard
                        key={post.id}
                        post={post}
                        onLike={handlePostLike}
                        onComment={() => {}}
                        onDelete={handlePostDelete}
                        onEdit={handlePostEdit}
                        onHide={handlePostHide}
                        onReshare={(created) => setPosts((prev) => [created, ...prev])}
                      />
                    ))}

                    {hasMore && (
                      <div className="text-center">
                        <Button
                          variant="outline"
                          onClick={() => loadFeedPosts(pageNumber + 1, true)}
                          disabled={feedLoading}
                          className="rounded-full"
                        >
                          {feedLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            t("actions.showMorePosts")
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT — Onboarding + Quick Actions + Suggestions */}
              <div className="hidden lg:block sticky top-24 space-y-4">
                <OnboardingProgress
                  tasks={dashboardData?.onboardingTasks || []}
                  completionPercentage={dashboardData?.onboardingCompletionPercentage}
                  loading={dashboardLoading}
                />
                <QuickActions userRole={effectiveRole} />
                <FeedRightPanel />
              </div>
            </div>
          </div>
        </div>

      <CreatePostModal
        open={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onPostCreated={handlePostCreated}
        initialMode={createPostMode}
      />
    </AppShell>
  );
}

// Marketing-home templates strip. Reads the unified registry so creator-
// published templates surface alongside in-house presets — the homepage
// advertises the full marketplace, not just the static catalog.
// The merged list is sliced so the section stays a single content block
// (visitors get a sample; the "Browse all templates" link below leads
// to the full /search?category=templates surface).
function MarketingTemplateStrip() {
  const { templates, loading } = useTemplates({});
  const { t } = useTranslation();
  const visible = templates.slice(0, 12);
  return (
    <div className="mb-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        {t("marketing.home.templatesTitle")}
      </h2>
      <p className="text-center text-muted-foreground mb-12">
        {t("marketing.home.templatesSubtitle")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {visible.map((meta) => (
          <MarketingTemplateCard key={`${meta.kind}:${meta.slug}`} meta={meta} />
        ))}
        {loading && visible.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`skel-${i}`}
                className="aspect-[4/3] animate-pulse rounded-xl bg-muted/40"
              />
            ))
          : null}
      </div>
    </div>
  );
}

// Per-card renderer — kind-agnostic via the shared <TemplatePreview/>
// which already handles studio-builtin (TemplateThumb), studio-creator
// (poster video) and resume (scaled document). Each card links to the
// per-template SEO page that owns the Use / Preview CTAs.
function MarketingTemplateCard({ meta }: { meta: TemplateMeta }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/marketplace/templates/${encodeURIComponent(meta.slug)}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-brand-purple hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden border-b bg-muted/30">
        <TemplatePreview meta={meta} compact />
        <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow">
            <Eye className="h-3.5 w-3.5" />
            {t("actions.preview")}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold leading-tight">{meta.name}</h3>
        {meta.blurb && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {meta.blurb}
          </p>
        )}
      </div>
    </Link>
  );
}
