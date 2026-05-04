import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Clock, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSEO } from "@/lib/seo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppShell";
import { articleService } from "@/lib/services/article-service";

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
  useSEO("/articles");
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

  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16">
          <article className="max-w-3xl mx-auto px-4 py-8">
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
                {article.coverImageUrl && (
                  <img src={article.coverImageUrl} alt="" className="w-full aspect-[16/9] object-cover rounded-lg mb-6" />
                )}
                <header className="space-y-3 mb-6">
                  {article.category && <Badge variant="secondary">{article.category}</Badge>}
                  <h1 className="text-3xl font-bold leading-tight">{article.title}</h1>
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
</div>
</AppShell>
  );
}
