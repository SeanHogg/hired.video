/**
 * /articles — public sector + audience filtered listing of published
 * articles. Powers the CTAs from sector landing pages, the pivot
 * explorer, and the resume guides that link `/articles?sector=…&audience=…`.
 *
 * Filter state is URL-bound (sector + audience query params) so deep
 * links share state and the sector landing page CTAs work without JS
 * coordination.
 *
 * Note on routing: prior to this gap (#1169) the `/articles` route
 * pointed at `ArticlesManager` (the creator authoring panel). The
 * canonical creator surface is `/services/creator/articles` — that's
 * where the Dashboard "Write article" button lands now. `/articles` is
 * the public discovery surface every sector-content link already used.
 */

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";
import { sectorFilterFromQuery, applySectorFilterToQuery } from "@/components/sector/SectorFilter";
import { ArticleCard } from "@/components/article/ArticleCard";
import ContentHero from "@/components/content/ContentHero";
import ChipFilterRow from "@/components/content/ChipFilterRow";
import { INDEX_COLUMN } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";
import {
  ARTICLE_AUDIENCE_LABELS,
  allSectors,
  enabledArticleAudiences,
  isArticleAudienceEnabled,
  type ArticleAudience,
  type Sector,
  sectorMeta,
} from "@shared/sectors";

function audienceFromQuery(params: URLSearchParams): ArticleAudience | null {
  const raw = params.get("audience");
  if (!raw) return null;
  // Gated list: a hiring audience (?audience=recruiter) is ignored while the
  // hiring personas are off.
  return (enabledArticleAudiences() as readonly string[]).includes(raw)
    ? (raw as ArticleAudience)
    : null;
}

function applyAudienceToQuery(params: URLSearchParams, value: ArticleAudience | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null) next.delete("audience");
  else next.set("audience", value);
  return next;
}

/** Mono label above each filter row. */
function FilterLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">{children}</p>;
}

export default function ArticlesIndex() {
  const { t } = useTranslation();
  useSEO("/articles");
  useBreadcrumbs([{ name: t("search.category.articles"), url: "/articles" }]);

  const [params, setParams] = useSearchParams();
  const sector = sectorFilterFromQuery(params);
  const audience = audienceFromQuery(params);

  const [articles, setArticles] = useState<PublicArticleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    void articleService
      .listPublished({
        limit: 60,
        sector: sector ?? undefined,
        audience: audience ?? undefined,
      })
      .then((rows) => {
        // Hiring-audience articles drop out while the hiring personas are off.
        if (alive) setArticles(rows.filter((r) => isArticleAudienceEnabled(r.audience)));
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sector, audience]);

  const heading = sector
    ? t("articles.index.sectorTitle", { sector: sectorMeta(sector).label })
    : t("articles.index.title");
  const subheading = sector ? sectorMeta(sector).tagline : t("articles.index.lede");
  const audienceLabel = (a: ArticleAudience) =>
    t(`articles.audience.${a}`, { defaultValue: ARTICLE_AUDIENCE_LABELS[a] });

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-[72px]">
        <ContentHero eyebrow={t("search.category.articles")} title={heading} lede={subheading} />

        <div className={cn(INDEX_COLUMN, "flex flex-col gap-6")}>
          <div className="flex flex-col gap-2">
            <FilterLabel>{t("articles.index.sector")}</FilterLabel>
            <ChipFilterRow<Sector>
              ariaLabel={t("articles.index.sectorAria")}
              allLabel={t("articles.index.allSectors")}
              value={sector ?? "all"}
              onChange={(next) =>
                setParams(applySectorFilterToQuery(params, next === "all" ? null : next), { replace: true })
              }
              options={allSectors().map((m) => ({ value: m.slug, label: m.label }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <FilterLabel>{t("articles.index.audience")}</FilterLabel>
            <ChipFilterRow<ArticleAudience>
              ariaLabel={t("articles.index.audienceAria")}
              allLabel={t("articles.index.allAudiences")}
              value={audience ?? "all"}
              onChange={(next) =>
                setParams(applyAudienceToQuery(params, next === "all" ? null : next), { replace: true })
              }
              options={enabledArticleAudiences().map((a) => ({ value: a, label: audienceLabel(a) }))}
            />
          </div>

          {loading && (
            <div className="flex justify-center py-16" role="status" aria-label={t("articles.index.loading")}>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          {error && !loading && (
            <p className="py-12 text-sm text-destructive" role="alert">
              {t("articles.index.loadError")}
            </p>
          )}

          {!loading && !error && articles.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <p className="font-medium text-foreground">{t("articles.index.empty")}</p>
              {sector && (
                <p className="text-sm text-muted-foreground">
                  <Link to={`/sectors/${sector}`} className="font-semibold text-primary hover:underline">
                    {t("articles.index.sectorLink", { sector: sectorMeta(sector).label })}
                  </Link>
                </p>
              )}
            </div>
          )}

          {!loading && !error && articles.length > 0 && (
            <>
              <p className="font-mono text-xs uppercase text-muted-foreground" aria-live="polite">
                {t("articles.index.count", { count: articles.length })}
              </p>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
                {articles.map((a) => (
                  <li key={a.id} className="flex">
                    <div className="w-full">
                      <ArticleCard article={a} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
