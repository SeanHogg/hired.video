/**
 * Single shape consumed by every "Blog & Guides" discovery surface
 * (#1315 / #1314). Lets the static BLOG_POSTS registry
 * (`frontend/data/blog-posts.ts`) and the DB-backed articles table
 * (`articleService.listPublished`) be merged into one feed without
 * either side knowing the other exists.
 *
 * Detail routes stay dual: `source: "blog"` rows link to
 * `/blog/<slug>`; `source: "article"` rows link to
 * `/articles/<authorSlug>/<articleSlug>`. The index page is the only
 * SSoT for the unified discovery experience.
 */
import type { BlogPost } from "@/data/blog-posts";
import { publicArticlePath } from "@shared/public-paths";
import type { PublicArticleCard } from "@/lib/services/article-service";

export interface UnifiedPost {
  id: string;
  title: string;
  description: string;
  category: string;
  href: string;
  publishedAt: string;
  readingTime: number;
  keywords: string;
  source: "blog" | "article";
}

export function blogPostToUnified(p: BlogPost): UnifiedPost {
  return {
    id: `blog:${p.slug}`,
    title: p.title,
    description: p.description,
    category: p.category,
    href: `/blog/${p.slug}`,
    publishedAt: p.publishedAt,
    readingTime: p.readingTime,
    keywords: [p.keywords ?? "", p.toolName ?? ""].filter(Boolean).join(" "),
    source: "blog",
  };
}

export function articleCardToUnified(a: PublicArticleCard): UnifiedPost {
  // Articles without a publishedAt are filtered server-side; this
  // fallback is purely a defence against partial responses.
  return {
    id: `article:${a.id}`,
    title: a.title,
    description: a.summary ?? "",
    category: a.category ?? (a.kind === "guide" ? "Guides" : "Articles"),
    href: publicArticlePath(a.author.slug, a.slug),
    publishedAt: a.publishedAt ?? new Date(0).toISOString(),
    readingTime: a.readMinutes,
    keywords: [a.tags ?? [], a.sector, a.audience].flat().filter(Boolean).join(" "),
    source: "article",
  };
}

/**
 * Merge the static blog catalogue + a DB-backed article slice into one
 * feed sorted newest-first. Pre-computed for stability so equality checks
 * across renders stay cheap.
 */
export function mergeUnifiedPosts(
  blogs: BlogPost[],
  articles: PublicArticleCard[],
): UnifiedPost[] {
  const merged: UnifiedPost[] = [
    ...blogs.map(blogPostToUnified),
    ...articles.map(articleCardToUnified),
  ];
  return merged.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}
