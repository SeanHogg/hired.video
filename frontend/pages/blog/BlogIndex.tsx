import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Clock, Calendar, Grid, List } from "lucide-react";
import { useMemo } from "react";
import { useSEO } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { BLOG_POSTS, type BlogPost } from "@/data/blog-posts";

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

const sortedPosts = [...BLOG_POSTS].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

function matchesQuery(post: BlogPost, q: string): boolean {
  if (!q) return true;
  const haystack = [
    post.title,
    post.description,
    post.category,
    post.keywords,
    post.toolName,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

export default function BlogIndex() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  useSEO(location.pathname);

  const query = searchParams.get("q") ?? "";
  const viewMode = (searchParams.get("view") === "list" ? "list" : "grid") as
    | "grid"
    | "list";

  const setViewMode = (mode: "grid" | "list") => {
    const next = new URLSearchParams(searchParams);
    if (mode === "list") next.set("view", "list");
    else next.delete("view");
    setSearchParams(next, { replace: true });
  };

  const posts = useMemo(
    () => sortedPosts.filter((p) => matchesQuery(p, query)),
    [query],
  );

  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16 p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Career Guides & AI Tool Tutorials
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Actionable guides to help you score, optimize, and tailor your
                resume — land more interviews — and negotiate the salary you
                deserve. Powered by hired.video&apos;s free AI career tools.
              </p>
            </div>

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
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {posts.length}
                    </span>{" "}
                    guides
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
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post) => (
                  <Link key={post.slug} to={`/blog/${post.slug}`} className="group">
                    <Card className="h-full hover:shadow-lg transition-shadow border-border/50">
                      <div className="h-40 rounded-t-lg bg-gradient-to-br from-primary/20 via-primary/10 to-blue-500/20 flex items-center justify-center">
                        <span className="text-4xl opacity-30 group-hover:opacity-50 transition-opacity">
                          {categoryEmoji(post.category)}
                        </span>
                      </div>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge
                            variant="secondary"
                            className={CATEGORY_COLORS[post.category] ?? ""}
                          >
                            {post.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {post.readingTime} min read
                          </span>
                        </div>
                        <h2 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </h2>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {post.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(post.publishedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="text-sm font-medium text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                            Read guide <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <Link key={post.slug} to={`/blog/${post.slug}`} className="group block">
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
