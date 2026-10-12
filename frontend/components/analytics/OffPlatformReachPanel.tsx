/**
 * OffPlatformReachPanel — "off-platform reach" in the artifact dashboard
 * (#2048): views, likes, shares and comments the networks reported for the
 * posts hired.video made of this artifact, summed, then per post with its
 * link. A count a network doesn't report reads "—", never 0.
 *
 * Self-gating: renders nothing until there is at least one post, and
 * nothing for a viewer who isn't the owner (the read answers 403).
 */
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import StatCard from "@/components/analytics/StatCard";
import { destinationLabel } from "@/lib/studio/publish-destination-meta";
import type { OffPlatformReachSource } from "@/lib/analytics/off-platform-reach";

export default function OffPlatformReachPanel({ artifactId, source }: { artifactId: string; source: OffPlatformReachSource }) {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ["distribution", "reach", artifactId],
    queryFn: () => source(artifactId),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const reach = q.data;
  if (!reach || reach.posts.length === 0) return null;
  const num = new Intl.NumberFormat(i18n.language, { notation: "compact" });
  const show = (n: number | null) => (n === null ? "—" : num.format(n));

  return (
    <section aria-labelledby={`off-platform-${artifactId}`} className="space-y-3">
      <div>
        <h3 id={`off-platform-${artifactId}`} className="text-sm font-semibold text-foreground">
          {t("distribution.metrics.title")}
        </h3>
        <p className="text-[13px] text-muted-foreground">{t("distribution.metrics.description")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title={t("distribution.metrics.views")} value={show(reach.totals.views)} icon={Eye} />
        <StatCard title={t("distribution.metrics.likes")} value={show(reach.totals.likes)} icon={Heart} />
        <StatCard title={t("distribution.metrics.shares")} value={show(reach.totals.shares)} icon={Share2} />
        <StatCard title={t("distribution.metrics.comments")} value={show(reach.totals.comments)} icon={MessageCircle} />
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {reach.posts.map((p, i) => (
          <li key={`${p.destination}-${i}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
            <span className="min-w-0 font-medium text-foreground">{destinationLabel(p.destination)}</span>
            <span className="text-muted-foreground">
              {p.fetchedAt === null
                ? t("distribution.metrics.notYet")
                : t("distribution.metrics.postLine", { views: show(p.views), likes: show(p.likes) })}
            </span>
            {p.externalUrl && (
              <a
                href={p.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
              >
                {t("distribution.list.view")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
