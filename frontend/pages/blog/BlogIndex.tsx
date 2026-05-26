import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Clock, Calendar, Grid, List } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSEO } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { CategoryFilterBar } from "@/components/CategoryFilterBar";
import ContentCard from "@/components/search/ContentCard";
import { BLOG_POSTS } from "@/data/blog-posts";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";
import { mergeUnifiedPosts, type UnifiedPost } from "@/lib/unified-posts";
import { slugify } from "@shared/slugify";

const CATEGORY_COLORS: Record<string, string> = {
  "Resume Tips": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Career Strategy": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "Job Search": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Video Resumes": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "Interview Prep": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "Developer Tools": "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function categoryEmoji(category: string) {
  switch (category) {
    case "Video Resumes":
      return "🎬";
    case "Interview Prep":
      return "🎤";
    case "Developer Tools":
      return "🛠";
    case "Career Strategy":
      return "📈";
    default:
      return "📄";
  }
}

function categorySlug(category: string): string {
  return slugify(category, { fallback: "uncategorized" });
}

function matchesQuery(post: UnifiedPost, q: string): boolean {
  if (!q) return true;
  const haystack = [post.title, post.description, post.category, post.keywords]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export default function BlogIndex() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  useSEO(location.pathname);

  // DB-backed articles (kind in {article, guide}) — merged with the
  // static BLOG_POSTS registry into a single unified list. Failures are
  // silently swallowed: /blog has always rendered BLOG_POSTS without a
  // network call, so a flaky articles endpoint must not break the index.
  const [dbArticles, setDbArticles] = useState<PublicArticleCard[]>([]);
  useEffect(() => {
    let alive = true;
    void articleService
      .listPublished({ limit: 120 })
      .then((rows) => {
        if (alive) setDbArticles(rows.filter((r) => r.kind !== "faq"));
      })
      .catch(() => {
        if (alive) setDbArticles([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sortedPosts = useMemo<UnifiedPost[]>(
    () => mergeUnifiedPosts(BLOG_POSTS, dbArticles),
    [dbArticles],
  );

  // Category chip list derived from whatever's in the merged catalogue.
  // Ordered by first appearance in `sortedPosts` so the newest-publishing
  // category surfaces earliest in the chip row — same contract the
  // /blog-only version had pre-#1230.
  const categoryList = useMemo<{ slug: string; label: string }[]>(() => {
    const seen = new Map<string, string>();
    for (const p of sortedPosts) {
      const slug = categorySlug(p.category);
      if (!seen.has(slug)) seen.set(slug, p.category);
    }
    return Array.from(seen, ([slug, label]) => ({ slug, label }));
  }, [sortedPosts]);

  const query = searchParams.get("q") ?? "";
  const viewMode = (searchParams.get("view") === "list" ? "list" : "grid") as
    | "grid"
    | "list";
  const rawCategory = searchParams.get("category");
  // Treat any unknown slug as "all" so a hand-typed/stale URL still renders
  // the full catalogue rather than an empty grid.
  const categoryFilter: string = useMemo(() => {
    if (!rawCategory) return "all";
    return categoryList.some((c) => c.slug === rawCategory) ? rawCategory : "all";
  }, [rawCategory, categoryList]);

  const setViewMode = (mode: "grid" | "list") => {
    const next = new URLSearchParams(searchParams);
    if (mode === "list") next.set("view", "list");
    else next.delete("view");
    setSearchParams(next, { replace: true });
  };

  const setCategoryFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("category");
    else params.set("category", next);
    setSearchParams(params, { replace: true });
  };

  // Posts after the text query only — drives the chip counts so the
  // numbers always reflect what the user will see if they click that chip.
  const postsAfterQuery = useMemo(
    () => sortedPosts.filter((p) => matchesQuery(p, query)),
    [sortedPosts, query],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of postsAfterQuery) {
      const slug = categorySlug(p.category);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }, [postsAfterQuery]);

  const posts = useMemo(() => {
    if (categoryFilter === "all") return postsAfterQuery;
    return postsAfterQuery.filter((p) => categorySlug(p.category) === categoryFilter);
  }, [postsAfterQuery, categoryFilter]);

  const activeCategoryLabel =
    categoryFilter === "all"
      ? null
      : categoryList.find((c) => c.slug === categoryFilter)?.label ?? null;

  return (
    <AppShell bgClassName="bg-background">
<div className="p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Blog & Guides
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Career guides, AI tool tutorials, sector deep-dives, and editorial
                articles — everything we publish on hired.video, in one place.
              </p>
            </div>

            {/* Category filter row — chip counts reflect the active text
                query so a chip never claims more guides than the grid
                will render after the user clicks it. */}
            <CategoryFilterBar
              value={categoryFilter}
              onChange={setCategoryFilter}
              allCount={postsAfterQuery.length}
              options={categoryList.map((c) => ({
                value: c.slug,
                label: c.label,
                count: categoryCounts.get(c.slug) ?? 0,
              }))}
            />

            {/* Toolbar: result count + view toggle */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {query ? (
                  <>
                    <span className="font-medium text-foreground">
                      {posts.length}
                    </span>{" "}
                    result{posts.length === 1 ? "" : "s"} for{" "}
                    <span className="font-medium text-foreground">
                      &quot;{query}&quot;
                    </span>
                    {activeCategoryLabel && (
                      <>
                        {" "}in{" "}
                        <span className="font-medium text-foreground">
                          {activeCategoryLabel}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {posts.length}
                    </span>{" "}
                    guides
                    {activeCategoryLabel && (
                      <>
                        {" "}in{" "}
                        <span className="font-medium text-foreground">
                          {activeCategoryLabel}
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                  aria-label="Grid view"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Posts */}
            {posts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                No guides match your search.
              </div>
            ) : viewMode === "grid" ? (
              // Grid mode renders the shared search/article ContentCard so
              // /blog and /?category=articles look identical (#326). List
              // mode is intentionally a different denser layout — kept
              // inline below. Both surfaces consume the unified
              // BLOG_POSTS + DB-articles list (#1230).
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post) => (
                  <ContentCard
                    key={post.id}
                    item={{
                      id: post.id,
                      type: "article",
                      title: post.title,
                      summary: post.description,
                      href: post.href,
                      category: post.category,
                      readingTime: post.readingTime,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <Link key={post.id} to={post.href} className="group block">
                    <Card className="hover:shadow-md transition-shadow border-border/50">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-14 w-14 flex-shrink-0 rounded-md bg-gradient-to-br from-primary/20 via-primary/10 to-blue-500/20 flex items-center justify-center text-2xl">
                          {categoryEmoji(post.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge
                              variant="secondary"
                              className={CATEGORY_COLORS[post.category] ?? ""}
                            >
                              {post.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {post.readingTime} min
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <h2 className="text-base font-semibold group-hover:text-primary transition-colors truncate">
                            {post.title}
                          </h2>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {post.description}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
</AppShell>
  );
}
