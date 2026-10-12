import { useEffect, useState } from "react";
import { publicArticlePath, publicProfilePath } from "@shared/public-paths";
import { usePageChrome } from "@/lib/seo";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import Markdown from "@/components/Markdown";
import { articleCoverImageUrl, useUgcSeo } from "@/lib/seo-ugc";
import MonoChip from "@/components/templates/MonoChip";
import { ReadingHeader } from "@/components/content/ReadingLayout";
import { PROSE_CLASS, READING_COLUMN } from "@/components/content/content-ui";
import { formatContentDate } from "@/lib/content/reading-meta";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AppShell } from "@/components/AppShell";
import { articleService } from "@/lib/services/article-service";
import { useArtifactViewTracking } from "@/hooks/use-artifact-view-tracking";
import ArtifactDetailsSheet from "@/components/shared/ArtifactDetailsSheet";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import TextNarrator from "@/components/audio/TextNarrator";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  bodyMd: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  readMinutes: number;
  viewCount: number;
  publishedAt: string | null;
  author: { id: string; name: string; avatarUrl: string | null; slug: string };
}

export default function ArticleView() {
  usePageChrome();
  const { t, i18n } = useTranslation();
  const { authorSlug, slug } = useParams<{ authorSlug: string; slug: string }>();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authorSlug || !slug) return;
    let cancelled = false;
    setLoading(true);
    articleService.getPublic(authorSlug, slug)
      .then((data) => { if (!cancelled) setArticle(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : t("errors.articleNotFound")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorSlug, slug, t]);

  useArtifactViewTracking({
    artifactKind: "article",
    artifactId: article?.id ?? null,
    ownerUserId: article?.author?.id ?? null,
  });

  // View-count beacon (#858) — the public read is edge-cached, so the bump is
  // a separate fire-and-forget call once per loaded article.
  useEffect(() => {
    if (!article?.id) return;
    void articleService.recordView(article.id);
  }, [article?.id]);

  // Read-time beacon (#1508) — while the reader page is loaded AND visible,
  // post 30s of read-progress every 30s (source "scroll"). Pauses when the tab
  // is backgrounded so idle background tabs don't inflate engagement.
  useEffect(() => {
    const id = article?.id;
    if (!id) return;
    const TICK = 30;
    const handle = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void articleService.recordReadProgress(id, TICK, "scroll");
      }
    }, TICK * 1000);
    return () => window.clearInterval(handle);
  }, [article?.id]);

  // SEO — single adapter call. Replaces the previous bug of passing the
  // hardcoded "/articles" path key, which meant every article shared the
  // /articles index meta instead of its own title/cover/JSON-LD.
  useUgcSeo("article", article);

  // Single trail powers BOTH the visible breadcrumb and the
  // BreadcrumbList JSON-LD (via the shared <Breadcrumbs> component).
  const trail =
    article && authorSlug
      ? [
          { name: t("search.category.articles"), url: "/articles" },
          { name: article.title, url: publicArticlePath(authorSlug, article.slug) },
        ]
      : [{ name: t("search.category.articles"), url: "/articles" }];

  const coverUrl = article ? articleCoverImageUrl(article) : null;

  return (
    <AppShell bgClassName="bg-background">
      <article className={cn(READING_COLUMN, "flex flex-col gap-8 pb-[72px] pt-6")}>
        <Breadcrumbs items={trail} />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t("status.loadingArticle")}
          </div>
        ) : error || !article ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <p className="font-medium text-foreground">{t("errors.articleNotFound")}</p>
            <p className="text-sm text-muted-foreground">{t("messages.articleNotFoundDesc")}</p>
            <Link to="/articles" className="mt-2 font-semibold text-primary hover:underline">
              {t("articleView.browseArticles")}
            </Link>
          </div>
        ) : (
          <>
            <ReadingHeader
              eyebrow={article.category}
              title={article.title}
              lede={article.summary}
              meta={[
                formatContentDate(article.publishedAt, i18n.language, "long"),
                t("labels.minRead", { minutes: article.readMinutes }),
                t("articleView.views", { count: article.viewCount }),
              ]}
              actions={
                <>
                  <ArtifactDetailsSheet
                    permission={{
                      kind: "article",
                      entity: { id: article.id, authorId: article.author.id },
                    }}
                    title={article.title}
                    activity={{
                      viewCount: article.viewCount,
                      createdAt: article.publishedAt,
                      extra: [
                        { label: t("labels.readTime"), value: t("labels.minutesValue", { count: article.readMinutes }) },
                      ],
                    }}
                  />
                  {/* Report this article — self-gates (hidden for the
                      author, bounces anon to /login). */}
                  <ReportAbuseButton
                    entityType="article"
                    entityId={article.id}
                    entityOwnerId={article.author.id}
                    entityLabel="article"
                  />
                </>
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Link
                  to={publicProfilePath(article.author.slug)}
                  className="inline-flex min-h-[44px] items-center gap-2.5 text-sm font-semibold text-foreground hover:text-primary"
                >
                  {article.author.avatarUrl ? (
                    <img src={article.author.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {(article.author.name ?? "?")[0]}
                    </span>
                  )}
                  {article.author.name}
                </Link>
                <TextNarrator
                  text={`${article.title}. ${article.summary ?? ""}\n\n${article.bodyMd}`}
                  preferenceKey={`article.${article.id}`}
                  label={t("articleView.listenLabel")}
                  onListenProgress={(elapsedSeconds) => {
                    // Read-aloud listening is a real consumption signal (#1577) —
                    // feed it into the same engagement telemetry as scroll reads.
                    void articleService.recordReadProgress(
                      article.id,
                      elapsedSeconds,
                      "narrator",
                    );
                  }}
                />
              </div>
            </ReadingHeader>

            {coverUrl && (
              <img
                src={coverUrl}
                alt=""
                className="aspect-[16/9] w-full rounded-[20px] border border-border object-cover"
              />
            )}

            <Markdown className={PROSE_CLASS}>{article.bodyMd}</Markdown>

            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-6">
                {article.tags.map((tag) => (
                  <MonoChip key={tag}>{tag}</MonoChip>
                ))}
              </div>
            )}
          </>
        )}
      </article>
    </AppShell>
  );
}
