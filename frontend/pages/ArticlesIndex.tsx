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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";
import { SectorFilter, sectorFilterFromQuery, applySectorFilterToQuery } from "@/components/sector/SectorFilter";
import { ArticleCard } from "@/components/article/ArticleCard";
import {
  ARTICLE_AUDIENCES,
  ARTICLE_AUDIENCE_LABELS,
  type ArticleAudience,
  sectorMeta,
} from "@shared/sectors";

function audienceFromQuery(params: URLSearchParams): ArticleAudience | null {
  const raw = params.get("audience");
  if (!raw) return null;
  return (ARTICLE_AUDIENCES as readonly string[]).includes(raw)
    ? (raw as ArticleAudience)
    : null;
}

function applyAudienceToQuery(params: URLSearchParams, value: ArticleAudience | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null) next.delete("audience");
  else next.set("audience", value);
  return next;
}

export default function ArticlesIndex() {
  useSEO("/articles");
  useBreadcrumbs([{ name: "Articles", url: "/articles" }]);

  const [params, setParams] = useSearchParams();
  const sector = sectorFilterFromQuery(params);
  const audience = audienceFromQuery(params);

  const [articles, setArticles] = useState<PublicArticleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void articleService
      .listPublished({
        limit: 60,
        sector: sector ?? undefined,
        audience: audience ?? undefined,
      })
      .then((rows) => {
        if (alive) setArticles(rows);
      })
      .catch(() => {
        if (alive) setError("Couldn't load articles. Try again in a moment.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sector, audience]);

  const heading = sector ? `${sectorMeta(sector).label} articles` : "Articles";
  const subheading = sector
    ? sectorMeta(sector).tagline
    : "Career guidance, sector deep-dives, recruiter playbooks, and pivot guides.";

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-20 max-w-6xl mx-auto px-6">
        <section className="py-10 space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">{heading}</h1>
          <p className="text-lg text-muted-foreground max-w-3xl">{subheading}</p>
        </section>

        <section className="pb-6 space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Sector</p>
            <SectorFilter
              value={sector}
              onChange={(next) => setParams(applySectorFilterToQuery(params, next), { replace: true })}
              mode="all"
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Audience</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Select
                value={audience ?? "__all__"}
                onValueChange={(v) => {
                  const next = v === "__all__" ? null : (v as ArticleAudience);
                  setParams(applyAudienceToQuery(params, next), { replace: true });
                }}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="All audiences" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All audiences</SelectItem>
                  {ARTICLE_AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ARTICLE_AUDIENCE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {audience && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setParams(applyAudienceToQuery(params, null), { replace: true })}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </section>

        {loading && <p className="text-sm text-muted-foreground py-12">Loading…</p>}
        {error && !loading && <p className="text-sm text-red-600 py-12">{error}</p>}

        {!loading && !error && articles.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground space-y-3">
              <p>No articles match this filter yet.</p>
              {sector && (
                <p className="text-sm">
                  Browse the{" "}
                  <Link to={`/sectors/${sector}`} className="underline">
                    {sectorMeta(sector).label} sector page
                  </Link>{" "}
                  for related content.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && !error && articles.length > 0 && (
          <section className="pb-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </section>
        )}
      </main>
    </AppShell>
  );
}
