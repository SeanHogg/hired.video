import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Heart,
  Share,
  Plus,
  Search,
  Filter,
  Users,
  Globe,
  Lock,
  RefreshCw,
  AlertCircle,
  Hash,
} from "lucide-react";

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { getFeedPosts, searchFeedPosts } from "@/lib/services/feed-service";
import type {
  FeedPost,
  FeedPostsResponse,
  GetFeedPostsRequest,
  FeedFilters,
} from "@/types/feed";

// Import feed components (will be created next)
import FeedPostCard from "@/components/feed/FeedPostCard";
import CreatePostModal from "@/components/feed/CreatePostModal";

export default function Feed() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading } = useAuth();

  // State management
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters and search
  const [filters, setFilters] = useState<FeedFilters>({
    searchTerm: "",
    filter: "all",
    privacy: "public",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);

  // Load feed posts
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
        setPosts(prev => [...prev, ...response.posts]);
      } else {
        setPosts(response.posts);
      }

      setTotalCount(response.totalCount);
      setHasMore(response.hasNextPage);
      setPageNumber(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed posts");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load and filter changes
  useEffect(() => {
    if (isAuthenticated) {
      loadFeedPosts(1, false);
    }
  }, [isAuthenticated, filters, loadFeedPosts]);

  // Handle search
  const handleSearch = useCallback((searchTerm: string) => {
    setFilters(prev => ({ ...prev, searchTerm }));
  }, []);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: Partial<FeedFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Load more posts
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadFeedPosts(pageNumber + 1, true);
    }
  }, [loading, hasMore, pageNumber, loadFeedPosts]);

  // Handle post creation
  const handlePostCreated = useCallback(() => {
    setCreatePostOpen(false);
    loadFeedPosts(1, false); // Refresh feed
  }, [loadFeedPosts]);

  // Handle post interactions
  const handlePostLike = useCallback((postId: string) => {
    setPosts(prev =>
      prev.map(post =>
        post.id === postId
          ? {
              ...post,
              isLikedByCurrentUser: !post.isLikedByCurrentUser,
              likeCount: post.isLikedByCurrentUser ? post.likeCount - 1 : post.likeCount + 1,
            }
          : post
      )
    );
  }, []);

  const handlePostComment = useCallback((postId: string) => {
    // This will be handled by the FeedPostCard component
    // We could implement optimistic updates here if needed
  }, []);

  // Authentication check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/5 to-blue-50/5">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <div className={`lg:ml-${sidebarCollapsed ? "16" : "80"}`}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/5 to-blue-50/5">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <div className={`lg:ml-${sidebarCollapsed ? "16" : "80"}`}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-4">Please sign in to view the feed</h1>
              <p className="text-muted-foreground mb-6">
                Connect with professionals and share your career updates
              </p>
              <Button asChild>
                <a href="/login">Sign In</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-purple-50/5 to-blue-50/5">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16">
          <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-2">
                    <MessageSquare className="h-8 w-8 text-primary" />
                    Social Feed
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Connect with professionals and share your career updates
                  </p>
                </div>
                <Button
                  onClick={() => setCreatePostOpen(true)}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Post
                </Button>
              </div>

              {/* Search and Filters */}
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          placeholder="Search posts, hashtags, or people..."
                          value={filters.searchTerm}
                          onChange={(e) => handleSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Filter Toggle */}
                    <Button
                      variant="outline"
                      onClick={() => setShowFilters(!showFilters)}
                      className="shrink-0"
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                    </Button>
                  </div>

                  {/* Advanced Filters */}
                  {showFilters && (
                    <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Feed Type</label>
                        <Select
                          value={filters.filter}
                          onValueChange={(value: "all" | "connections" | "following") =>
                            handleFilterChange({ filter: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                All Posts
                              </div>
                            </SelectItem>
                            <SelectItem value="connections">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Connections
                              </div>
                            </SelectItem>
                            <SelectItem value="following">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Following
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Privacy</label>
                        <Select
                          value={filters.privacy}
                          onValueChange={(value: "public" | "connections") =>
                            handleFilterChange({ privacy: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                Public
                              </div>
                            </SelectItem>
                            <SelectItem value="connections">
                              <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4" />
                                Connections
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          onClick={() => setFilters({
                            searchTerm: "",
                            filter: "all",
                            privacy: "public",
                          })}
                          className="w-full"
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Error State */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadFeedPosts(1, false)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Feed Posts */}
            <div className="space-y-6">
              {posts.length === 0 && !loading ? (
                <Card>
                  <CardContent className="pt-12 pb-12 text-center">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Be the first to share something with your network!
                    </p>
                    <Button onClick={() => setCreatePostOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Post
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {posts.map((post) => (
                    <FeedPostCard
                      key={post.id}
                      post={post}
                      onLike={handlePostLike}
                      onComment={handlePostComment}
                    />
                  ))}

                  {/* Load More */}
                  {hasMore && (
                    <div className="text-center">
                      <Button
                        variant="outline"
                        onClick={loadMore}
                        disabled={loading}
                        className="min-w-[120px]"
                      >
                        {loading ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          "Load More"
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Loading State */}
                  {loading && posts.length === 0 && (
                    <div className="space-y-6">
                      {[...Array(3)].map((_, i) => (
                        <Card key={i} className="animate-pulse">
                          <CardContent className="p-6">
                            <div className="flex items-start space-x-4">
                              <div className="w-10 h-10 bg-muted rounded-full"></div>
                              <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded w-1/4"></div>
                                <div className="h-4 bg-muted rounded w-full"></div>
                                <div className="h-4 bg-muted rounded w-3/4"></div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
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
      />
    </div>
  );
}