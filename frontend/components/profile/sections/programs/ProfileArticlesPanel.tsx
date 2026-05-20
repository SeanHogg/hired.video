// Public-profile Articles tab — lists every published article authored
// by the profile owner. Self-fetching + self-gating; the parent only
// passes `userId` + `isOwner`.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Eye, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";
import EmptyProgramState from "./EmptyProgramState";

interface Props {
  userId: string;
  isOwner: boolean;
}

export default function ProfileArticlesPanel({ userId, isOwner }: Props) {
  const [items, setItems] = useState<PublicArticleCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    articleService
      .listPublishedByUser(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading articles…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return <EmptyProgramState program="articles" isOwner={isOwner} />;
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((a) => (
        <ArticleRow key={a.id} article={a} />
      ))}
    </div>
  );
}

function ArticleRow({ article }: { article: PublicArticleCard }) {
  const href = `/articles/${article.author.slug}/${article.slug}`;
  return (
    <Link
      to={href}
      className="block rounded-lg border bg-card hover:bg-accent/5 transition-colors overflow-hidden"
    >
      {article.coverImageUrl ? (
        <div className="aspect-video bg-muted">
          <img
            src={article.coverImageUrl}
            alt={article.title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {article.category && (
            <Badge variant="secondary" className="text-xs">
              {article.category}
            </Badge>
          )}
        </div>
        <h3 className="font-semibold leading-tight line-clamp-2">{article.title}</h3>
        {article.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">{article.summary}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {article.readMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {article.viewCount}
          </span>
        </div>
      </div>
    </Link>
  );
}
