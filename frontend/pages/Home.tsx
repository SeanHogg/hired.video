import { useCallback, useEffect, useState } from "react";
import { ZodError } from "zod";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, MessageSquare, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { AppEmptyState } from "@/components/app/AppEmptyState";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

import { useAuth } from "@/lib/auth";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import useDashboard from "@/hooks/dashboard/useDashboard";
import ReferralBanner from "@/components/ReferralBanner";
import EarnHubBanner from "@/components/EarnHubBanner";
import InternalAdSlot from "@/components/ads/InternalAdSlot";

// Shared dashboard components (used in feed sidebar)
import QuickActions from "@/components/dashboard/shared/QuickActions";
import ActivityFeed from "@/components/dashboard/shared/ActivityFeed";
import OnboardingProgress from "@/components/dashboard/shared/OnboardingProgress";
import WelcomeHero from "@/components/dashboard/shared/WelcomeHero";
import DashboardQuickActions from "@/components/dashboard/DashboardQuickActions";
import HomeMarketingPage from "@/components/dashboard/HomeMarketingPage";

// Feed data + components (reused from Feed.tsx)
import { getFeedPosts, searchFeedPosts, applyReactionToPost } from "@/lib/services/feed-service";
import type {
  FeedPost,
  FeedPostsResponse,
  GetFeedPostsRequest,
  FeedFilters,
} from "@/types/feed";
import FeedPostCard from "@/components/feed/FeedPostCard";
import CreatePostModal from "@/components/feed/CreatePostModal";
import FeedProfileCard from "@/components/feed/FeedProfileCard";
import { FeedRightPanel } from "@/components/feed/FeedRightPanel";
import { FeedComposerHeader } from "@/components/feed/FeedComposer";

type PostMode = "text" | "video" | "photo" | "article";

// ─── Authenticated Home: Dashboard widgets + Feed in one page ────────────────
export default function Home() {
  const { t } = useTranslation();
  const location = useLocation();
  // Registered for both the signed-out pitch and the signed-in workspace.
  useSEO(location.pathname);
  useDefaultBreadcrumbs();
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

  const handlePostReact = useCallback((postId: string, reactionType: string | null) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? applyReactionToPost(post, reactionType) : post,
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

  // ─── Authenticated view: quick Build / Post actions → Feed ───────────────
  return (
    <AppShell bgClassName="bg-background">
        <div className="pb-20">
          <div className={APP_PAGE_COLUMN}>
            <PageHeader
              title={t("dashboard.workspace.title")}
              description={t("dashboard.workspace.subtitle")}
            />

            <DashboardQuickActions className="mb-8" />

            <div className="mb-6">
              <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-[-0.02em]">
                <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
                {t("headings.yourFeed")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("messages.feedTagline")}</p>
            </div>

            <EarnHubBanner />
            <ReferralBanner />
            <InternalAdSlot slot="dashboard-banner" className="mb-4" />

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

                {/* Composer + filter tabs — sticky on scroll; flattens to a
                    compact bar that taps back open to the full options. */}
                <FeedComposerHeader
                  user={user as never}
                  onOpen={openCreate}
                  filter={filters.filter ?? "all"}
                  onFilterChange={(v) =>
                    setFilters((prev) => ({ ...prev, filter: v }))
                  }
                />

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
                  <AppEmptyState
                    icon={MessageSquare}
                    title={t("messages.feedEmptyTitle")}
                    description={t("messages.feedEmptyBody")}
                    action={<Button onClick={() => openCreate("text")}>{t("actions.startPost")}</Button>}
                  />
                ) : (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <FeedPostCard
                        key={post.id}
                        post={post}
                        onReact={handlePostReact}
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

