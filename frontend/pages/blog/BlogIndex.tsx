import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import ContentCard from "@/components/search/ContentCard";
import ContentHero from "@/components/content/ContentHero";
import ChipFilterRow from "@/components/content/ChipFilterRow";
import { CONTENT_CARD, INDEX_COLUMN } from "@/components/content/content-ui";
import { MetaLine } from "@/components/content/ReadingLayout";
import MonoChip from "@/components/templates/MonoChip";
import ViewModeToggle from "@/components/ViewModeToggle";
import { publishedBlogPosts } from "@/lib/content/published-blog-posts";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";
import { mergeUnifiedPosts, type UnifiedPost } from "@/lib/unified-posts";
import { articleCategoryI18nKey } from "@/lib/article-category";
import { formatContentDate } from "@/lib/content/reading-meta";
import { cn } from "@/lib/utils";
import { slugify } from "@shared/slugify";

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
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

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
    () => mergeUnifiedPosts(publishedBlogPosts(), dbArticles),
    [dbArticles],
  );

  // Category chip list derived from whatever's in the merged catalogue,
  // ordered by first appearance so the newest-publishing category surfaces
  // earliest in the chip row.
  const categoryList = useMemo<{ slug: string; label: string }[]>(() => {
    const seen = new Map<string, string>();
    for (const p of sortedPosts) {
      const slug = categorySlug(p.category);
      if (!seen.has(slug)) seen.set(slug, p.category);
    }
    return Array.from(seen, ([slug, label]) => ({ slug, label }));
  }, [sortedPosts]);

  // Gate at 2 chars via the shared hook so single-keystroke ?q=A
  // doesn't narrow the guides grid to noise.
  const { effective: query } = useSearchQueryParam();
  const viewMode = (searchParams.get("view") === "list" ? "list" : "grid") as "grid" | "list";
  const rawCategory = searchParams.get("category");
  // Treat any unknown slug as "all" so a hand-typed/stale URL still renders
  // the full catalogue rather than an empty grid.
  const categoryFilter: string = useMemo(() => {
    if (!rawCategory) return "all";
    return categoryList.some((c) => c.slug === rawCategory) ? rawCategory : "all";
  }, [rawCategory, categoryList]);

  const setViewMode = (mode: string) => {
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

  const categoryLabel = (raw: string) => t(articleCategoryI18nKey(raw), { defaultValue: raw });
  const activeCategoryLabel =
    categoryFilter === "all"
      ? null
      : (() => {
          const raw = categoryList.find((c) => c.slug === categoryFilter)?.label;
          return raw ? categoryLabel(raw) : null;
        })();

  const countLine = query
    ? t("blog.index.resultsFor", { count: posts.length, query })
    : t("blog.index.count", { count: posts.length });

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-[72px]">
        <ContentHero
          eyebrow={t("labels.blog")}
          title={t("blog.index.title")}
          lede={t("blog.index.lede")}
        />

        <div className={cn(INDEX_COLUMN, "flex flex-col gap-6")}>
          {/* Chip counts reflect the active text query so a chip never
              claims more guides than the grid will render. */}
          <ChipFilterRow
            ariaLabel={t("blog.index.categoryAria")}
            value={categoryFilter}
            onChange={setCategoryFilter}
            allCount={postsAfterQuery.length}
            options={categoryList.map((c) => ({
              value: c.slug,
              label: categoryLabel(c.label),
              count: categoryCounts.get(c.slug) ?? 0,
            }))}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase text-muted-foreground" aria-live="polite">
              {countLine}
              {activeCategoryLabel && ` · ${activeCategoryLabel}`}
            </p>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>

          {posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center text-muted-foreground">
              {t("blog.index.empty")}
            </div>
          ) : viewMode === "grid" ? (
            // Grid mode renders the shared ContentCard so /blog and
            // /?category=articles look identical (#326). Both consume the
            // unified BLOG_POSTS + DB-articles list (#1230).
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
              {posts.map((post) => (
                <li key={post.id} className="flex">
                  <div className="w-full">
                    <ContentCard
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
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={cn(CONTENT_CARD, "divide-y divide-border overflow-hidden")}>
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    to={post.href}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <MonoChip>{categoryLabel(post.category)}</MonoChip>
                        <MetaLine
                          parts={[
                            formatContentDate(post.publishedAt, i18n.language, "short"),
                            t("contentCard.minRead", { count: post.readingTime }),
                          ]}
                        />
                      </div>
                      <h2 className="truncate text-base font-semibold text-foreground group-hover:text-primary">
                        {post.title}
                      </h2>
                      <p className="line-clamp-1 text-sm text-muted-foreground">{post.description}</p>
                    </div>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
