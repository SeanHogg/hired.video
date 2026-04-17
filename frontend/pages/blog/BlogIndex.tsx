import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { useSEO } from "@/lib/seo";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { BLOG_POSTS } from "@/data/blog-posts";

const CATEGORY_COLORS: Record<string, string> = {
  "Resume Tips": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Career Strategy": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "Job Search": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Video Resumes": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "Interview Prep": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "Developer Tools": "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

// Show newest first
const sortedPosts = [...BLOG_POSTS].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

export default function BlogIndex() {
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } =
    useSidebar();

  useSEO(location.pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={closeSidebar}
      />
      <div className="flex-1 flex flex-col min-h-screen">
        <Navigation onMenuClick={openSidebar} />
        <div className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Career Guides & AI Tool Tutorials
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Actionable guides to help you score, optimize, and tailor your
              resume — land more interviews — and negotiate the salary you
              deserve. Powered by hired.video's free AI career tools.
            </p>
          </div>

          {/* Posts grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {sortedPosts.map((post) => (
              <Link key={post.slug} to={`/blog/${post.slug}`} className="group">
                <Card className="h-full hover:shadow-lg transition-shadow border-border/50">
                  {/* Gradient hero placeholder */}
                  <div className="h-40 rounded-t-lg bg-gradient-to-br from-primary/20 via-primary/10 to-blue-500/20 flex items-center justify-center">
                    <span className="text-4xl opacity-30 group-hover:opacity-50 transition-opacity">
                      {post.category === "Video Resumes"
                        ? "🎬"
                        : post.category === "Interview Prep"
                          ? "🎤"
                          : post.category === "Developer Tools"
                            ? "🛠"
                            : post.category === "Career Strategy"
                              ? "📈"
                              : "📄"}
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
        </div>
        <Footer />
      </div>
    </div>
  );
}
