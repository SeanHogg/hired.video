import React, { useState, useEffect, useCallback } from "react";
import { ZodError } from "zod";
import {
  MessageSquare,
  Share2,
  Globe,
  Lock,
  Users,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Search,
  ChevronRight,
  Building2,
  TrendingUp,
  MessageCircle,
  Repeat2,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useAuth } from "@/lib/auth";
import {
  getFeedPosts,
  searchFeedPosts,
  getTrendingTags,
  getTrendingPosts,
  applyReactionToPost,
} from "@/lib/services/feed-service";
import { DEFAULT_REACTION, reactionDef } from "@shared/feed-reactions";
import type {
  FeedPost,
  FeedPostsResponse,
  GetFeedPostsRequest,
  FeedFilters,
  TrendingTag,
  TrendingPost,
} from "@/types/feed";

import FeedPostCard from "@/components/feed/FeedPostCard";
import CreatePostModal from "@/components/feed/CreatePostModal";
import FeedProfileCard from "@/components/feed/FeedProfileCard";
import { FeedComposerHeader } from "@/components/feed/FeedComposer";
import ToolsCTA from "@/components/dashboard/shared/ToolsCTA";
import { CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

type PostMode = "text" | "video" | "photo" | "article";

// ─── Unauthenticated marketing page ──────────────────────────────────────────
function FeedMarketingPage() {
  return (
    <AppShell>
      <div className="px-4 py-16">
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <MessageSquare className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Career Feed
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">Your Professional Community, Powered by AI</h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Share career wins, ask for advice, celebrate job offers, and stay inspired by professionals on the same journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                    Join the Community <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
                <a href="/login">
                  <Button size="lg" variant="outline" className="text-lg px-8">Sign In</Button>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              {[
                { icon: Users, color: "text-brand-purple", title: "Share Career Milestones", desc: "Announce a new role, celebrate a promotion, or share a lesson learned." },
                { icon: Globe, color: "text-brand-blue", title: "Hashtag-Powered Discovery", desc: "Tag posts with topics to reach the right professionals." },
                { icon: Lock, color: "text-primary", title: "Privacy Controls", desc: "Choose who sees each post — public, connections, or private." },
              ].map(({ icon: Icon, color, title, desc }) => (
                <Card key={title} className="border-border/50 hover:border-primary/30 transition-colors">
                  <CardHeader>
                    <Icon className={`h-10 w-10 ${color} mb-4`} />
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {["Real-time interactions", "AI-powered suggestions", "Professional networking"].map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />{f}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
      </div>
    </AppShell>
  );
}

// ─── Trending posts — ranked by recent engagement ─────────────────────────────
// Real data from /api/feed/trending-posts (weighted reactions + reposts +
// comments). Each row deep-links to the post detail page. Self-gates: renders
// nothing until there are trending posts to show. Reused by Home + Feed via
// FeedRightPanel.
export function TrendingPostsCard() {
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const trending = await getTrendingPosts(5);
        if (!cancelled) setPosts(Array.isArray(trending) ? trending : []);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (posts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-primary" />
          Trending
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ul className="divide-y">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                to={`/feed/${p.id}`}
                className="block rounded-md px-2 py-2 hover:bg-muted/60 transition-colors"
              >
                <p className="text-xs text-muted-foreground mb-0.5">{p.userName}</p>
                <p className="text-sm line-clamp-2 leading-snug">
                  {p.excerpt || "View post"}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                  <span className="flex items-center gap-1">
                    {/* Total reactions across all professional types — the
                        default 👍 glyph stands in for the mixed set (no
                        longer a heart). */}
                    <span aria-hidden>{reactionDef(DEFAULT_REACTION).emoji}</span>{" "}
                    {p.reactionCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {p.commentCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="h-3 w-3" /> {p.repostCount}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Right sidebar — suggestions & trending ───────────────────────────────────
export function FeedRightPanel({
  activeTag,
  onSelectTag,
}: {
  activeTag?: string | null;
  onSelectTag?: (tag: string) => void;
} = {}) {
  // Real trending hashtags (gap #1829) — fetched from the backend's
  // /api/feed/trending-tags endpoint and clickable to filter the feed.
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  useEffect(() => {
    let cancelled = false;
    // Wrapped in an async IIFE + try/catch so a throwing/absent service never
    // surfaces as an unhandled rejection or crashes the panel.
    (async () => {
      try {
        const tags = await getTrendingTags(8);
        if (!cancelled) setTrendingTags(Array.isArray(tags) ? tags : []);
      } catch {
        if (!cancelled) setTrendingTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Sharpen Your Edge with Tools */}
      <ToolsCTA variant="compact" />

      {/* Trending posts — ranked by engagement; click-through to detail. */}
      <TrendingPostsCard />


      {/* Add to your feed */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Add to your feed</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {[
            { name: "Jobs at hired.video", sub: "Company", icon: Building2 },
            { name: "AI in Hiring", sub: "Topic", icon: Sparkles },
            { name: "Remote Work", sub: "Topic", icon: Globe },
          ].map(({ name, sub, icon: Icon }) => (
            <div key={name} className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">{name}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs rounded-full px-3 h-7 shrink-0">
                + Follow
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* People you may know */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">People you may know</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <Link
            to="/people"
            className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
          >
            View all in My Network <ChevronRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>

      {/* Trending hashtags (gap #1829) — real data, click to filter the feed.
          Self-gates: renders nothing until there are tags to show. */}
      {trendingTags.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Trending topics</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {trendingTags.map(({ tag, postCount }) => {
                const isActive = activeTag === tag;
                return (
                  <Badge
                    key={tag}
                    variant={isActive ? "default" : "secondary"}
                    onClick={() => onSelectTag?.(tag)}
                    title={`${postCount} post${postCount === 1 ? "" : "s"}`}
                    className="text-xs cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    #{tag}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Feed page ────────────────────────────────────────────────────────────
export default function Feed() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [filters, setFilters] = useState<FeedFilters>({ searchTerm: "", filter: "all", privacy: "public" });
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [createPostMode, setCreatePostMode] = useState<PostMode>("text");
  const [searchInput, setSearchInput] = useState("");

  const loadFeedPosts = useCallback(async (page = 1, append = false) => {
    try {
      setLoading(true);
      setError(null);

      const request: GetFeedPostsRequest = {
        searchTerm: filters.searchTerm || undefined,
        filter: filters.filter === "all" ? undefined : filters.filter,
        privacy: filters.privacy,
        tag: filters.tag || undefined,
        pageNumber: page,
        pageSize: 20,
      };

      let response: FeedPostsResponse;
      if (filters.tag) {
        // Hashtag filter (gap #1829) wins over free-text search — clicking a
        // trending tag scopes the feed to that hashtag via the `?tag=` filter.
        response = await getFeedPosts(request);
      } else if (filters.searchTerm) {
        response = await searchFeedPosts(filters.searchTerm, page, 20);
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
      setError(err instanceof ZodError ? "Failed to load feed" : err instanceof Error ? err.message : "Failed to load feed posts");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (isAuthenticated) loadFeedPosts(1, false);
  }, [isAuthenticated, filters, loadFeedPosts]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, searchTerm: searchInput }));
  }, [searchInput]);

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

  const handlePostEdit = useCallback((postId: string, updatedPost: FeedPost) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? updatedPost : post)),
    );
  }, []);

  const handlePostHide = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const openCreate = useCallback((mode: PostMode) => {
    setCreatePostMode(mode);
    setCreatePostOpen(true);
  }, []);

  // Hashtag discovery (gap #1829): clicking a trending tag scopes the feed to
  // it (toggling off when the same tag is clicked again) and clears any active
  // text search so the two filters don't fight.
  const handleSelectTag = useCallback((tag: string) => {
    setFilters((prev) => ({ ...prev, tag: prev.tag === tag ? undefined : tag, searchTerm: "" }));
    setSearchInput("");
  }, []);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated || !user) {
    return <FeedMarketingPage />;
  }

  return (
    <AppShell bgClassName="bg-muted/30">
        <div className="pb-20">
          {/* Search bar — full width strip */}
          <div className="bg-background border-b sticky top-16 z-10">
            <div className="px-4 py-2">
              <form onSubmit={handleSearch} className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search posts, hashtags, people..."
                  className="pl-9 h-9 rounded-full text-sm"
                />
              </form>
            </div>
          </div>

          {/* 3-column layout */}
          <div className="px-4 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">

              {/* LEFT — Profile card */}
              <div className="hidden lg:block sticky top-28">
                <FeedProfileCard user={user as any} />
              </div>

              {/* CENTER — Post bar + Feed */}
              <div className="min-w-0 space-y-4">
                {/* Composer + filter tabs. Non-sticky here — the search strip
                    above already owns the sticky top slot on this surface. */}
                <FeedComposerHeader
                  user={user as any}
                  onOpen={openCreate}
                  filter={filters.filter ?? "all"}
                  onFilterChange={(v) => setFilters((prev) => ({ ...prev, filter: v }))}
                  sticky={false}
                />

                {/* Active hashtag filter banner (gap #1829) */}
                {filters.tag && (
                  <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-2">
                    <span className="text-sm">
                      Showing posts tagged <span className="font-semibold text-primary">#{filters.tag}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, tag: undefined }))}
                    >
                      Clear
                    </Button>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{error}</span>
                      <Button variant="outline" size="sm" onClick={() => loadFeedPosts(1, false)}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Loading skeletons */}
                {loading && posts.length === 0 && (
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

                {/* Posts */}
                {!loading && posts.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Nothing here yet</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Be the first to share something with your network!
                      </p>
                      <Button onClick={() => openCreate("text")}>Start a post</Button>
                    </CardContent>
                  </Card>
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
                        onSelectTag={handleSelectTag}
                        onReshare={(created) => setPosts((prev) => [created, ...prev])}
                      />
                    ))}

                    {hasMore && (
                      <div className="text-center">
                        <Button
                          variant="outline"
                          onClick={() => loadFeedPosts(pageNumber + 1, true)}
                          disabled={loading}
                          className="rounded-full"
                        >
                          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Show more posts"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT — Suggestions */}
              <div className="hidden lg:block sticky top-28">
                <FeedRightPanel activeTag={filters.tag} onSelectTag={handleSelectTag} />
              </div>
            </div>
          </div>
        </div>

      {/* Create Post Modal */}
      <CreatePostModal
        open={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onPostCreated={handlePostCreated}
        initialMode={createPostMode}
      />
    </AppShell>
  );
}
