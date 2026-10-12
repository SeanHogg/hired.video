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
import { publicArticlePath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import ShareMenu from "@/components/share/ShareMenu";
import MonoChip from "@/components/templates/MonoChip";
import type { PublicArticleCard } from "@/lib/services/article-service";
import { localizeSector } from "@/lib/sectors/localize-sector";
import { buildImageUrl } from "@/lib/utils";
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
  const { t } = useTranslation();
  const sectorLabel =
    article.sector && isValidSector(article.sector)
      ? localizeSector(sectorMeta(article.sector as Sector), t).label
      : null;
  const audienceLabel =
    article.audience && (ARTICLE_AUDIENCES as readonly string[]).includes(article.audience)
      ? t(`articles.audience.${article.audience}`, {
          defaultValue: ARTICLE_AUDIENCE_LABELS[article.audience as ArticleAudience],
        })
      : null;
  const articleUrl = `${window.location.origin}${publicArticlePath(article.author.slug, article.slug)}`;
  return (
    <div className="relative h-full">
      {/* Share — the reusable cross-card ShareMenu, absolutely positioned so
          it sits over the card link. The wrapper stops the click from
          triggering the card's navigation. */}
      <div
        className="absolute right-2 top-2 z-10"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <ShareMenu variant="icon" align="end" url={articleUrl} title={article.title} text={article.summary ?? undefined} />
      </div>
      <Link
        to={publicArticlePath(article.author.slug, article.slug)}
        className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {article.coverImageUrl && (
          <div
            className="h-32 w-full bg-muted bg-cover bg-center"
            style={{ backgroundImage: `url(${buildImageUrl(article.coverImageUrl)})` }}
          />
        )}
        <div className="flex flex-1 flex-col gap-3 p-6">
          {(sectorLabel || audienceLabel) && (
            <div className="flex flex-wrap gap-1.5 pr-10">
              {sectorLabel && <MonoChip>{sectorLabel}</MonoChip>}
              {audienceLabel && <MonoChip>{audienceLabel}</MonoChip>}
            </div>
          )}
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">{article.title}</h3>
          {article.summary && (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{article.summary}</p>
          )}
          <p className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {t("contentCard.minRead", { count: article.readMinutes })} · {article.author.name}
            </span>
            {article.author.isSystem && <MonoChip>{t("labels.editorial")}</MonoChip>}
          </p>
        </div>
      </Link>
    </div>
  );
}
