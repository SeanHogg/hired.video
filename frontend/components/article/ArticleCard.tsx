/**
 * <ArticleCard /> — single rendering of a public article card. One
 * component, reused by the public listing (/articles), sector landing
 * pages (/sectors/:sector), and any future surface that needs to
 * display a stream of published articles.
 *
 * Self-renders sector + audience badges from the article's own fields —
 * never prop-drilled. Per the DRY rule, the badge derivation lives here
 * once, not duplicated at every call site.
 */

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicArticleCard } from "@/lib/services/article-service";
import {
  ARTICLE_AUDIENCES,
  ARTICLE_AUDIENCE_LABELS,
  isValidSector,
  sectorMeta,
  type ArticleAudience,
  type Sector,
} from "@shared/sectors";

export interface ArticleCardProps {
  article: PublicArticleCard;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const sectorLabel =
    article.sector && isValidSector(article.sector)
      ? sectorMeta(article.sector as Sector).label
      : null;
  const audienceLabel =
    article.audience && (ARTICLE_AUDIENCES as readonly string[]).includes(article.audience)
      ? ARTICLE_AUDIENCE_LABELS[article.audience as ArticleAudience]
      : null;
  return (
    <Link to={`/articles/${article.author.slug}/${article.slug}`}>
      <Card className="h-full hover:border-primary/50 transition-colors">
        {article.coverImageUrl && (
          <div
            className="h-32 w-full rounded-t-lg bg-cover bg-center"
            style={{ backgroundImage: `url(${article.coverImageUrl})` }}
          />
        )}
        <CardHeader>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {sectorLabel && (
              <Badge variant="secondary" className="text-xs">
                {sectorLabel}
              </Badge>
            )}
            {audienceLabel && (
              <Badge variant="outline" className="text-xs">
                {audienceLabel}
              </Badge>
            )}
          </div>
          <CardTitle className="text-base line-clamp-2">{article.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {article.summary && (
            <p className="text-muted-foreground line-clamp-3">{article.summary}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {article.readMinutes} min read · {article.author.name}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
