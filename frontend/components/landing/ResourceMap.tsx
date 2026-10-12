/**
 * ResourceMap — content discovery grid grouped by ContentLocationKind,
 * filtered by EITHER an audience key (/for/[audience]) or a structured
 * geo filter (/in/[country]/[state]/[city]). Each kind is one bucket;
 * buckets self-hide when they have zero items so empty buckets never
 * render.
 *
 * Per the DRY rule (#1663) — ONE component, two filter axes. The
 * consumer passes which axis is in play via the discriminated `filter`
 * prop; the fetch + "see all" links + empty-state branch on it.
 */
import { useEffect, useMemo, useState } from "react";
import { publicArticleByIdPath, publicJobPath, publicResumePath, publicVideoPath } from "@shared/public-paths";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import {
  fetchResourceContent,
  type AudienceContentItem,
  type ResourceFilter,
} from "@/lib/services/audience-content-service";
import type { ContentLocationKind } from "@shared/content-locations";
import TemplateKindChip from "@/components/templates/TemplateKindChip";
import { LinkTile } from "./LinkTile";

export interface ResourceMapProps {
  /** Which axis is in play — audience key OR structured geo filter. */
  filter: ResourceFilter;
  /** Ordered list of content kinds to surface. Empty buckets self-hide. */
  kinds: ContentLocationKind[];
  /** Per-kind item cap. Default 6. */
  limit?: number;
  /** Optional section heading override. */
  heading?: string;
  subheading?: string;
  tone?: "page" | "card";
}

/** Kinds with a localized bucket label (`seoLanding.resourceMap.kind.<kind>`). */
const LABELLED_KINDS: ReadonlySet<ContentLocationKind> = new Set<ContentLocationKind>([
  "job",
  "resume",
  "video",
  "article",
  "template",
  "learning_path",
  "voice",
  "user_profile",
  "company",
  "event",
  "service",
]);

/** Build the "see all" deep-link for a bucket. Encodes whichever filter
 *  axis is active so the destination list page stays scoped. */
function seeAllHref(kind: ContentLocationKind, filter: ResourceFilter): string | undefined {
  const qs = new URLSearchParams();
  if ("audienceKey" in filter) {
    qs.set("audience", filter.audienceKey);
  } else {
    qs.set("countryId", String(filter.geo.countryId));
    if (filter.geo.stateId) qs.set("stateId", filter.geo.stateId);
    if (filter.geo.cityId) qs.set("cityId", filter.geo.cityId);
  }
  const suffix = `?${qs.toString()}`;
  switch (kind) {
    case "job": return `/jobs${suffix}`;
    case "article": return `/articles${suffix}`;
    case "template": return `/search?category=templates&${qs.toString()}`;
    case "resume": return `/search?category=resumes&${qs.toString()}`;
    case "video": return `/search?category=media&${qs.toString()}`;
    case "learning_path": return `/search?category=learning_paths&${qs.toString()}`;
    case "event": return `/events${suffix}`;
    default: return undefined;
  }
}

interface BucketState {
  loading: boolean;
  items: AudienceContentItem[];
}

/** Stable key for the filter so the fetch effect re-runs when it changes
 *  without depending on object identity. */
function filterKey(filter: ResourceFilter): string {
  return "audienceKey" in filter
    ? `a:${filter.audienceKey}`
    : `g:${filter.geo.countryId}:${filter.geo.stateId ?? ""}:${filter.geo.cityId ?? ""}`;
}

export function ResourceMap({
  filter,
  kinds,
  limit = 6,
  heading,
  subheading,
  tone = "card",
}: ResourceMapProps): JSX.Element {
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<Record<string, BucketState>>(() =>
    Object.fromEntries(kinds.map((k) => [k, { loading: true, items: [] }])),
  );
  const fKey = filterKey(filter);

  useEffect(() => {
    let cancelled = false;
    setBuckets(Object.fromEntries(kinds.map((k) => [k, { loading: true, items: [] }])));
    void Promise.all(
      kinds.map(async (kind) => {
        const items = await fetchResourceContent(kind, filter, limit);
        if (cancelled) return;
        setBuckets((prev) => ({ ...prev, [kind]: { loading: false, items } }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [fKey, kinds.join(","), limit]);

  const visibleKinds = useMemo(() => {
    return kinds.filter((k) => {
      const b = buckets[k];
      return !b || b.loading || b.items.length > 0;
    });
  }, [kinds, buckets]);

  if (visibleKinds.length === 0) {
    return (
      <MarketingBand tone={tone} className="flex flex-col items-start gap-4">
        <p className="text-muted-foreground">{t("seoLanding.resourceMap.empty")}</p>
        <Button asChild variant="outline">
          <Link to="/search">{t("seoLanding.resourceMap.browseAll")}</Link>
        </Button>
      </MarketingBand>
    );
  }

  return (
    <MarketingBand tone={tone} labelledBy="resource-map-title" className="flex flex-col gap-12">
      <MarketingSectionIntro
        id="resource-map-title"
        title={heading ?? t("seoLanding.resourceMap.heading")}
        subtitle={subheading ?? t("seoLanding.resourceMap.subheading")}
      />
      {visibleKinds.map((kind) => {
        const bucket = buckets[kind] ?? { loading: true, items: [] };
        const label = LABELLED_KINDS.has(kind) ? t(`seoLanding.resourceMap.kind.${kind}`) : kind;
        const href = seeAllHref(kind, filter);
        return (
          <div key={kind} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">{label}</h3>
              {href ? (
                <Link
                  to={href}
                  className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  {t("seoLanding.common.seeAll")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4">
              {bucket.loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <li key={i}>
                      <Skeleton className="h-28 w-full rounded-[20px]" />
                    </li>
                  ))
                : bucket.items.map((item) => (
                    <li key={item.id}>
                      <LinkTile
                        to={item.href ?? hrefForItem(item)}
                        title={<span className="line-clamp-2 text-lg">{item.title}</span>}
                        body={item.summary || item.description || undefined}
                        chip={
                          item.type === "template" ? (
                            <TemplateKindChip
                              mediaKind={item.mediaKind}
                              documentKind={item.documentKind}
                              className="shrink-0"
                            />
                          ) : undefined
                        }
                        headingLevel="h4"
                        className="p-5"
                      />
                    </li>
                  ))}
            </ul>
          </div>
        );
      })}
    </MarketingBand>
  );
}

function hrefForItem(item: AudienceContentItem): string {
  switch (item.type) {
    case "job":
      return publicJobPath(item.id);
    case "resume":
      return publicResumePath(item.id);
    case "template":
      return `/templates/${item.id}`;
    case "article":
      return publicArticleByIdPath(item.id);
    case "media":
    case "video":
      return publicVideoPath(item.id);
    case "learning_path":
      return `/courses/${item.id}`;
    case "event":
      return `/events/${item.id}`;
    default:
      return "/search";
  }
}
