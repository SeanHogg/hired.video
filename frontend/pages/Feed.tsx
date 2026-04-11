import React, { useState, useEffect, useCallback } from "react";
import { ZodError } from "zod";
import {
  MessageSquare,
  Heart,
  Share2,
  Globe,
  Lock,
  Users,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Image,
  Video,
  FileText,
  Search,
  ChevronRight,
  Building2,
} from "lucide-react";

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

type PostMode = "text" | "video" | "photo" | "article";

// ─── Unauthenticated marketing page ──────────────────────────────────────────
function FeedMarketingPage({
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
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <div className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
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

            <div className="grid md:grid-cols-3 gap-8 mb-16">
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
        </div>
        <Footer />
      </div>
    </div>
  );
}

// ─── Inline post composer bar ─────────────────────────────────────────────────
export function PostComposerBar({
  user,
  onOpen,
}: {
  user: { name?: string | null; email?: string | null; [key: string]: unknown };
  onOpen: (mode: PostMode) => void;
}) {
  const initials = ((user.name as string) || (user.email as string) || "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatar = (user.avatar as string) ?? "";

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        {/* Top row: avatar + text input trigger */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={avatar} alt={(user.name as string) ?? ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => onOpen("text")}
            className="flex-1 text-left text-sm text-muted-foreground border rounded-full px-4 py-2.5 hover:bg-muted/50 hover:border-primary/40 transition-colors"
          >
            What do you want to talk about?
          </button>
        </div>

        <Separator className="mb-3" />

        {/* Bottom row: media type buttons */}
        <div className="flex items-center justify-around">
          <button
            type="button"
            onClick={() => onOpen("video")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-blue-600 transition-colors"
          >
            <Video className="h-5 w-5 text-blue-500" />
            Video
          </button>
          <button
            type="button"
            onClick={() => onOpen("photo")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-green-600 transition-colors"
          >
            <Image className="h-5 w-5 text-green-500" />
            Photo
          </button>
          <button
            type="button"
            onClick={() => onOpen("article")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-orange-600 transition-colors"
          >
            <FileText className="h-5 w-5 text-orange-500" />
            Write article
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Right sidebar — suggestions & trending ───────────────────────────────────
export function FeedRightPanel() {
  return (
    <div className="space-y-4">
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

      {/* Hashtag suggestions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Trending topics</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {["#hiring", "#remotework", "#ai", "#career", "#jobs", "#leadership", "#networking"].map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Feed filter tabs ─────────────────────────────────────────────────────────
export function FeedFilterTabs({
  active,
  onChange,
}: {
  active: "all" | "connections" | "following";
  onChange: (v: "all" | "connections" | "following") => void;
}) {
  const tabs: { value: "all" | "connections" | "following"; label: string; icon: React.ReactNode }[] = [
    { value: "all", label: "All", icon: <Globe className="h-4 w-4" /> },
    { value: "connections", label: "Connections", icon: <Users className="h-4 w-4" /> },
    { value: "following", label: "Following", icon: <Heart className="h-4 w-4" /> },
  ];

  return (
    <div className="flex border-b bg-card rounded-t-xl overflow-hidden">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex items-center gap-2 flex-1 justify-center py-3 text-sm font-medium border-b-2 transition-colors ${
            active === tab.value
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Feed page ────────────────────────────────────────────────────────────
export default function Feed() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
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
        pageNumber: page,
        pageSize: 20,
      };

      let response: FeedPostsResponse;
      if (filters.searchTerm) {
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

  const handlePostLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLikedByCurrentUser: !post.isLikedByCurrentUser,
              likeCount: post.isLikedByCurrentUser ? post.likeCount - 1 : post.likeCount + 1,
            }
          : post,
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

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
          <div className="pt-16 flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <FeedMarketingPage
        sidebarOpen={sidebarOpen}
        closeSidebar={closeSidebar}
        sidebarCollapsed={sidebarCollapsed}
        openSidebar={openSidebar}
        toggleSidebar={toggleSidebar}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 pb-20">
          {/* Search bar — full width strip */}
          <div className="bg-background border-b sticky top-16 z-10">
            <div className="max-w-6xl mx-auto px-4 py-2">
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
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">

              {/* LEFT — Profile card */}
              <div className="hidden lg:block sticky top-28">
                <FeedProfileCard user={user as any} />
              </div>

              {/* CENTER — Post bar + Feed */}
              <div className="min-w-0 space-y-4">
                {/* Post composer */}
                <PostComposerBar user={user as any} onOpen={openCreate} />

                {/* Filter tabs */}
                <div className="bg-card rounded-xl overflow-hidden border">
                  <FeedFilterTabs
                    active={filters.filter ?? "all"}
                    onChange={(v) => setFilters((prev) => ({ ...prev, filter: v }))}
                  />
                </div>

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
                <FeedRightPanel />
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>

      {/* Create Post Modal */}
      <CreatePostModal
        open={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onPostCreated={handlePostCreated}
        initialMode={createPostMode}
      />

      {/* Footer Chat Panel */}
      <ChatPanel />
    </div>
  );
}
