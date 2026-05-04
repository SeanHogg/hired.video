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
} from "lucide-react";

import DiscoverPreview from "@/components/DiscoverPreview";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import MarketingFAQ from "@/components/MarketingFAQ";
import { ToolCard } from "@/components/ToolCard";
import { getToolsForHome } from "@/data/tools-catalog";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useSEO } from "@/lib/seo";
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
function HomeMarketingPage({
  sidebarOpen,
  closeSidebar,
  sidebarCollapsed,
  openSidebar,
  toggleSidebar,
}: {
  sidebarOpen: boolean;
  closeSidebar: () => void;
  sidebarCollapsed: boolean;
  openSidebar: () => void;
  toggleSidebar: () => void;
}) {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);

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
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
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
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
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
            <div className="grid md:grid-cols-4 gap-6 mb-16">
              {HOME_STATS.map((s) => (
                <div key={s.stat} className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {s.stat}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Discover — unified search preview surfaced alongside the CTA.
             * Submitting or clicking any chip deep-links into /search so the
             * homepage and the dedicated search page share one index. */}
            <DiscoverPreview className="mb-16" />

            {/* Features */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                {t("marketing.home.featuresTitle")}
              </h2>
              <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
                {t("marketing.home.featuresSubtitle")}
              </p>
              <div className="grid md:grid-cols-3 gap-8">
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
              <div className="grid md:grid-cols-4 gap-8">
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
              <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
                {t("marketing.home.toolsSubtitle")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                {getToolsForHome().map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>

            {/* Testimonials */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.home.testimonialsTitle")}
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
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
          <div className="max-w-4xl mx-auto px-4 py-16">
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
              <h3 className="text-3xl font-bold mb-4">
                {t("marketing.home.ctaTitle")}
              </h3>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
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

        <Footer />
      </div>
    </div>
  );
}

// ─── Authenticated Home: Dashboard widgets + Feed in one page ────────────────
export default function Home() {
  const { t } = useTranslation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
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
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">{t("status.loading")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated → marketing page
  if (!isAuthenticated || !user) {
    return (
      <HomeMarketingPage
        sidebarOpen={sidebarOpen}
        closeSidebar={closeSidebar}
        sidebarCollapsed={sidebarCollapsed}
        openSidebar={openSidebar}
        toggleSidebar={toggleSidebar}
      />
    );
  }

  // ─── Authenticated view: Dashboard section → Feed section ───────────────
  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 pb-20">
          {/* ── Feed section ── */}
          <div className="max-w-6xl mx-auto px-4 py-6">
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

        <Footer />
      </div>

      <CreatePostModal
        open={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onPostCreated={handlePostCreated}
        initialMode={createPostMode}
      />
    </div>
  );
}
