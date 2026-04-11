import React, { useCallback, useEffect, useState } from "react";
import { ZodError } from "zod";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Video as VideoIcon,
} from "lucide-react";

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import useDashboard from "@/hooks/dashboard/useDashboard";
import ReferralBanner from "@/components/ReferralBanner";
import AdSlot from "@/components/ads/AdSlot";

// Role-specific dashboard components
import JobSeekerDashboard from "@/components/dashboard/JobSeekerDashboard";
import RecruiterDashboard from "@/components/dashboard/RecruiterDashboard";
import EmployerDashboard from "@/components/dashboard/EmployerDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ProductDashboard from "@/pages/admin/ProductDashboard";
import { AffiliateDashboardContent } from "@/pages/AffiliateDashboard";

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

// ─── Unauthenticated marketing page (consolidated from Dashboard + Feed) ─────
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

        <div className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <TrendingUp className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Your Career Home
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Command Center + Career Community
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Track your resumes, jobs, outreach, and network — and share
                wins, ask for advice, and celebrate offers with professionals on
                the same journey. All on one page.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>

            {/* Benefits grid — 6 cards combining both marketing narratives */}
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                <CardHeader>
                  <VideoIcon className="h-10 w-10 text-brand-purple mb-4" />
                  <CardTitle>Unified Dashboard</CardTitle>
                  <CardDescription>
                    See your latest resumes, applications, and outreach stats
                    at a glance.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                <CardHeader>
                  <Briefcase className="h-10 w-10 text-brand-blue mb-4" />
                  <CardTitle>Actionable Insights</CardTitle>
                  <CardDescription>
                    AI-powered recommendations for your next best step.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <Users className="h-10 w-10 text-primary mb-4" />
                  <CardTitle>Network Growth</CardTitle>
                  <CardDescription>
                    Track connections and outreach performance over time.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                <CardHeader>
                  <MessageSquare className="h-10 w-10 text-brand-purple mb-4" />
                  <CardTitle>Share Career Milestones</CardTitle>
                  <CardDescription>
                    Announce new roles, celebrate promotions, share lessons
                    learned.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                <CardHeader>
                  <Sparkles className="h-10 w-10 text-brand-blue mb-4" />
                  <CardTitle>Hashtag-Powered Discovery</CardTitle>
                  <CardDescription>
                    Tag posts with topics to reach the right professionals.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <TrendingUp className="h-10 w-10 text-primary mb-4" />
                  <CardTitle>Privacy Controls</CardTitle>
                  <CardDescription>
                    Choose who sees each post — public, connections, or
                    private.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

// ─── Authenticated Home: Dashboard widgets + Feed in one page ────────────────
export default function Home() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading, impersonationSession } = useAuth();
  const { personaPreview } = usePersonaPreview();

  // Dashboard state
  const {
    dashboardData,
    loading: dashboardLoading,
    error: dashboardError,
    lastRefresh,
    refreshDashboard,
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

  // Effective role: impersonation > persona preview > actual
  const effectiveRole =
    impersonationSession?.role ?? personaPreview ?? user?.role ?? null;
  const rolePermissions = createRolePermissions(effectiveRole);

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
            ? "Failed to load feed"
            : err instanceof Error
              ? err.message
              : "Failed to load feed posts",
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

  // Role-to-dashboard component mapping
  const getDashboardComponent = () => {
    const commonProps = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dashboardData: dashboardData as any,
      loading: dashboardLoading,
      onRefresh: refreshDashboard,
    };

    if (rolePermissions.isSuperAdmin) return <ProductDashboard />;
    if (rolePermissions.isAdmin) return <AdminDashboard {...commonProps} />;
    if (rolePermissions.isJobSeeker)
      return <JobSeekerDashboard {...commonProps} />;
    if (rolePermissions.isRecruiter)
      return <RecruiterDashboard {...commonProps} />;
    if (rolePermissions.isEmployer)
      return <EmployerDashboard {...commonProps} />;
    if (rolePermissions.isAffiliate) return <AffiliateDashboardContent />;

    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome to hired.video</h1>
        <p className="text-muted-foreground">
          Your role ({user?.role}) doesn&apos;t have a specific dashboard yet.
        </p>
      </div>
    );
  };

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
              <p className="text-sm text-muted-foreground">Loading...</p>
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
          {/* ── Dashboard section ── */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    {dashboardData?.title ?? "Your Home"}
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground mt-1">
                    {dashboardData?.description ??
                      "Your dashboard and community feed in one place."}
                  </p>
                  {lastRefresh && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last updated: {lastRefresh.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <ReferralBanner />
            <div className="flex justify-center mb-4">
              <AdSlot slot="dashboard-banner" size="banner" />
            </div>

            {dashboardLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Loading dashboard...
                </p>
              </div>
            ) : dashboardError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="flex-1">{dashboardError}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDashboard}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : dashboardData ? (
              getDashboardComponent()
            ) : (
              <div className="text-center text-sm text-muted-foreground py-8">
                No dashboard data available
              </div>
            )}
          </div>

          {/* ── Divider between Dashboard and Feed ── */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Separator className="my-4" />
          </div>

          {/* ── Feed section ── */}
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                Your Feed
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Share career wins, ask for advice, celebrate offers.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">
              {/* LEFT — Profile card */}
              <div className="hidden lg:block sticky top-24">
                <FeedProfileCard user={user as never} />
              </div>

              {/* CENTER — Post composer + filter tabs + posts */}
              <div className="min-w-0 space-y-4">
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
                        <RefreshCw className="h-4 w-4 mr-1" /> Retry
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
                        Nothing here yet
                      </h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Be the first to share something with your network!
                      </p>
                      <Button onClick={() => openCreate("text")}>
                        Start a post
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
                            "Show more posts"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT — Suggestions */}
              <div className="hidden lg:block sticky top-24">
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

      <ChatPanel />
    </div>
  );
}
