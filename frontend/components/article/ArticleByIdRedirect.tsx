/**
 * `/articles/by-id/:id` — resolves a published article's id to its public
 * page (`/articles/<author>/<slug>`) and redirects there (#2312). A studio
 * linked-content card stores only the article id, so its CTA link and the
 * export's QR point here. An article that isn't publicly readable lands on
 * the articles index.
 */
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { articleService } from "@/lib/services/article-service";

export default function ArticleByIdRedirect() {
  const { id } = useParams<{ id: string }>();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void articleService.getPublicPath(id ?? "").then((path) => {
      if (!cancelled) setTarget(path ?? "/articles");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return target ? <Navigate to={target} replace /> : null;
}
