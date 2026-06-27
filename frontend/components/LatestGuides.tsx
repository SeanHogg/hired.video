import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BLOG_POSTS } from "@/data/blog-posts";
import MarketingSection, {
  type MarketingCard,
} from "@/components/marketing/MarketingSection";

const CATEGORY_COLORS: Record<string, string> = {
  "Resume Tips": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Career Strategy":
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "Job Search": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Video Resumes": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "Interview Prep":
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "Developer Tools":
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
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

const latestPosts = [...BLOG_POSTS]
  .sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )
  .slice(0, 6);

export default function LatestGuides() {
  const { t } = useTranslation();
  if (latestPosts.length === 0) return null;

  const cards: MarketingCard[] = latestPosts.map((post) => ({
    key: post.slug,
    node: (
      <Link to={`/blog/${post.slug}`} className="group block h-full">
        <Card className="h-full hover:shadow-lg transition-shadow border-border/50">
          <div className="h-32 rounded-t-lg bg-gradient-to-br from-primary/20 via-primary/10 to-blue-500/20 flex items-center justify-center">
            <span className="text-3xl opacity-30 group-hover:opacity-50 transition-opacity">
              {categoryEmoji(post.category)}
            </span>
          </div>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge
                variant="secondary"
                className={CATEGORY_COLORS[post.category] ?? ""}
              >
                {post.category}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t("messages.readingTimeMin", { count: post.readingTime })}
              </span>
            </div>
            <h3 className="text-base font-semibold mb-1 group-hover:text-primary transition-colors line-clamp-2">
              {post.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {post.description}
            </p>
          </CardContent>
        </Card>
      </Link>
    ),
  }));

  return (
    <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <MarketingSection
          id="latest-guides"
          align="left"
          icon={BookOpen}
          title={t("headings.latestGuides")}
          cards={cards}
          gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          headerAction={
            <Link
              to="/blog"
              className="group flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
            >
              {t("actions.viewAllGuides")}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        />
      </div>
    </section>
  );
}
