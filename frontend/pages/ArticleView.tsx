import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Clock, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { articleCoverImageUrl, useUgcSeo } from "@/lib/seo-ugc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AppShell } from "@/components/AppShell";
import { articleService } from "@/lib/services/article-service";
import { useArtifactViewTracking } from "@/hooks/use-artifact-view-tracking";
import ArtifactDetailsSheet from "@/components/shared/ArtifactDetailsSheet";
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
  const { t } = useTranslation();
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

  // SEO — single adapter call. Replaces the previous bug of passing the
  // hardcoded "/articles" path key, which meant every article shared the
  // /articles index meta instead of its own title/cover/JSON-LD.
  useUgcSeo("article", article);

  // Single trail powers BOTH the visible breadcrumb and the
  // BreadcrumbList JSON-LD (via the shared <Breadcrumbs> component).
  const trail =
    article && authorSlug
      ? [
          { name: "Articles", url: "/articles" },
          { name: article.title, url: `/articles/${authorSlug}/${article.slug}` },
        ]
      : [{ name: "Articles", url: "/articles" }];

  const coverUrl = article ? articleCoverImageUrl(article) : null;

  return (
    <AppShell bgClassName="bg-background">
      <article className="px-4 py-8">
        <Breadcrumbs items={trail} />

        {loading ? (
          <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("status.loadingArticle")}
          </CardContent></Card>
        ) : error || !article ? (
          <Card><CardContent className="p-8 text-center">
            <p className="font-medium mb-2">{t("errors.articleNotFound")}</p>
            <p className="text-sm text-muted-foreground">{t("messages.articleNotFoundDesc")}</p>
          </CardContent></Card>
        ) : (
          <>
            {coverUrl && (
              <img src={coverUrl} alt="" className="w-full aspect-[16/9] object-cover rounded-lg mb-6" />
            )}
            <header className="space-y-3 mb-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  {article.category && <Badge variant="secondary">{article.category}</Badge>}
                  <h1 className="text-3xl font-bold leading-tight">{article.title}</h1>
                </div>
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
                      { label: "Read time", value: `${article.readMinutes} min` },
                    ],
                  }}
                />
              </div>
              {article.summary && <p className="text-lg text-muted-foreground">{article.summary}</p>}
              <div className="flex items-center gap-3 text-sm text-muted-foreground pt-2 border-t">
                <Link to={`/people/${article.author.slug}`} className="flex items-center gap-2 hover:underline">
                  {article.author.avatarUrl ? (
                    <img src={article.author.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                      {(article.author.name ?? "?")[0]}
                    </div>
                  )}
                  <span>{article.author.name}</span>
                </Link>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t("labels.minRead", { minutes: article.readMinutes })}</span>
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {article.viewCount}</span>
                {article.publishedAt && (
                  <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                )}
              </div>
            </header>

            <div className="mb-6">
              <TextNarrator
                text={`${article.title}. ${article.summary ?? ""}\n\n${article.bodyMd}`}
                preferenceKey={`article.${article.id}`}
                label="Listen to this article"
              />
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.bodyMd}</ReactMarkdown>
            </div>

            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </article>
    </AppShell>
  );
}
