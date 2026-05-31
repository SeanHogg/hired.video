/**
 * ArticleInlineBody — renders a user-authored article inside a
 * `linked-content` canvas widget. Mounts the same `<Markdown/>` body
 * the public `ArticleView` page renders so the embedded preview shows
 * the article's actual published prose, not a hand-rolled snippet.
 *
 * Layout: full-width cover image at the top (when present) +
 * meta strip (tags / read minutes) + bold title + summary + rendered
 * markdown body. Scaled to fit the widget via `ScaledTemplateFrame`.
 *
 * Future kinds (#814 follow-ons) can share the same body-renderer
 * pattern — every inline body fetches its entity by id, wraps an
 * appropriate renderer in `ScaledTemplateFrame`, and that's the whole
 * shape.
 */
import { useEffect, useState } from "react";
import Markdown from "@/components/Markdown";
import { articleService, type Article } from "@/lib/services/article-service";
import { buildImageUrl } from "@/lib/utils";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface ArticleInlineBodyProps {
  id: string;
}

export default function ArticleInlineBody({ id }: ArticleInlineBodyProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    articleService
      .getMine(id)
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading article…" />;
  if (loadState === "error" || !article) {
    return <InlineBodyMessage label="Couldn't load this article." />;
  }

  return (
    <ScaledTemplateFrame>
      <article className="bg-white px-8 py-6 text-slate-900">
        {article.coverImageUrl && (
          <img
            src={buildImageUrl(article.coverImageUrl)}
            alt=""
            className="mb-4 h-48 w-full rounded-md object-cover"
          />
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {article.category && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
              {article.category}
            </span>
          )}
          {article.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5">
              #{t}
            </span>
          ))}
          {article.readMinutes > 0 && (
            <span>· {article.readMinutes} min read</span>
          )}
        </div>
        <h1 className="mb-3 text-3xl font-bold leading-tight">
          {article.title}
        </h1>
        {article.summary && (
          <p className="mb-4 text-base italic leading-snug text-slate-600">
            {article.summary}
          </p>
        )}
        <div className="prose prose-sm max-w-none">
          <Markdown>{article.bodyMd}</Markdown>
        </div>
      </article>
    </ScaledTemplateFrame>
  );
}
