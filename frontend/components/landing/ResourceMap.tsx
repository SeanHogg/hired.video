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
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import {
  fetchResourceContent,
  type AudienceContentItem,
  type ResourceFilter,
} from "@/lib/services/audience-content-service";
import type { ContentLocationKind } from "@shared/content-locations";

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
}

const KIND_LABELS: Partial<Record<ContentLocationKind, string>> = {
  job: "Jobs",
  resume: "Resume templates",
  video: "Video resumes",
  article: "Articles & guides",
  template: "Studio templates",
  learning_path: "Learning paths",
  voice: "Voice marketplace",
  user_profile: "People",
  company: "Companies",
  event: "Events",
  service: "Services",
};

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

export function ResourceMap({ filter, kinds, limit = 6, heading, subheading }: ResourceMapProps): JSX.Element {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fKey, kinds.join(","), limit]);

  const visibleKinds = useMemo(() => {
    return kinds.filter((k) => {
      const b = buckets[k];
      return !b || b.loading || b.items.length > 0;
    });
  }, [kinds, buckets]);

  if (visibleKinds.length === 0) {
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center text-muted-foreground">
          <p>Resources here are being curated. In the meantime, explore the full library.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/search">Browse everything</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8 bg-muted/20">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold">{heading ?? "Resource map"}</h2>
          <p className="mt-2 text-muted-foreground">
            {subheading ?? "Hand-picked across templates, articles, video, learning paths, and open roles."}
          </p>
        </div>
        {visibleKinds.map((kind) => {
          const bucket = buckets[kind] ?? { loading: true, items: [] };
          const label = KIND_LABELS[kind] ?? kind;
          const href = seeAllHref(kind, filter);
          return (
            <div key={kind}>
              <div className="mb-4 flex items-end justify-between">
                <h3 className="text-xl font-semibold">{label}</h3>
                {href ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={href}>
                      See all
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bucket.loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))
                  : bucket.items.map((item) => (
                      <ResourceCard key={item.id} item={item} />
                    ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResourceCard({ item }: { item: AudienceContentItem }): JSX.Element {
  const href = item.href ?? hrefForItem(item);
  return (
    <Link to={href} className="block">
      <Card className="h-full hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <p className="font-medium line-clamp-2">{item.title}</p>
          {item.summary || item.description ? (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
              {item.summary ?? item.description}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function hrefForItem(item: AudienceContentItem): string {
  switch (item.type) {
    case "job":
      return `/jobs/${item.id}`;
    case "resume":
      return `/resumes/${item.id}`;
    case "template":
      return `/templates/${item.id}`;
    case "article":
      return `/articles/${item.id}`;
    case "media":
    case "video":
      return `/v/${item.id}`;
    case "learning_path":
      return `/courses/${item.id}`;
    case "event":
      return `/events/${item.id}`;
    default:
      return "/search";
  }
}
