// Feed right rail (shared by /feed and the signed-in Home): tools CTA,
// trending posts, follow suggestions, network link and trending hashtags.
// Data comes from the typed feed-service; each card self-gates on empty.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, ChevronRight, Globe, MessageCircle, Repeat2, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolsCTA from "@/components/dashboard/shared/ToolsCTA";
import { getTrendingPosts, getTrendingTags } from "@/lib/services/feed-service";
import { DEFAULT_REACTION, reactionDef } from "@shared/feed-reactions";
import type { TrendingPost, TrendingTag } from "@/types/feed";
import { cn } from "@/lib/utils";

const RAIL_CARD = "rounded-[20px] border border-border bg-card";

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 px-4 pt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </h2>
  );
}

/** Trending posts ranked by recent engagement; self-gates on empty. */
export function TrendingPostsCard() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const trending = await getTrendingPosts(5);
        if (!cancelled) setPosts(Array.isArray(trending) ? trending : []);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (posts.length === 0) return null;

  return (
    <section className={RAIL_CARD}>
      <RailHeading>
        <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {t("feed.rail.trending")}
      </RailHeading>
      <ul className="divide-y divide-border px-2 pb-2 pt-1">
        {posts.map((p) => (
          <li key={p.id}>
            <Link to={`/feed/${p.id}`} className="block rounded-xl px-2 py-2.5 transition-colors hover:bg-muted">
              <p className="mb-0.5 text-xs text-muted-foreground">{p.userName}</p>
              <p className="line-clamp-2 text-sm leading-snug text-foreground">{p.excerpt || t("feed.rail.viewPost")}</p>
              <div className="mt-1 flex items-center gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                <span className="flex items-center gap-1">
                  {/* Total reactions across all professional types — the
                      default reaction glyph stands in for the mixed set. */}
                  <span aria-hidden="true">{reactionDef(DEFAULT_REACTION).emoji}</span> {p.reactionCount}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" aria-hidden="true" /> {p.commentCount}
                </span>
                <span className="flex items-center gap-1">
                  <Repeat2 className="h-3 w-3" aria-hidden="true" /> {p.repostCount}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SUGGESTIONS = [
  { id: "jobs", nameKey: "feed.rail.suggest.jobs", subKey: "feed.rail.kind.company", icon: Building2 },
  { id: "ai", nameKey: "feed.rail.suggest.ai", subKey: "feed.rail.kind.topic", icon: Sparkles },
  { id: "remote", nameKey: "feed.rail.suggest.remote", subKey: "feed.rail.kind.topic", icon: Globe },
] as const;

export function FeedRightPanel({
  activeTag,
  onSelectTag,
}: {
  activeTag?: string | null;
  onSelectTag?: (tag: string) => void;
} = {}) {
  const { t } = useTranslation();
  // Real trending hashtags (gap #1829), clickable to filter the feed.
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  useEffect(() => {
    let cancelled = false;
    // Async IIFE + try/catch so a throwing/absent service never surfaces as
    // an unhandled rejection or crashes the panel.
    (async () => {
      try {
        const tags = await getTrendingTags(8);
        if (!cancelled) setTrendingTags(Array.isArray(tags) ? tags : []);
      } catch {
        if (!cancelled) setTrendingTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <ToolsCTA variant="compact" />

      {/* Trending posts — ranked by engagement; click-through to detail. */}
      <TrendingPostsCard />

      <section className={RAIL_CARD}>
        <RailHeading>{t("feed.rail.addToFeed")}</RailHeading>
        <ul className="flex flex-col gap-3 p-4">
          {SUGGESTIONS.map(({ id, nameKey, subKey, icon: Icon }) => (
            <li key={id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-foreground">{t(nameKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(subKey)}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-full px-3 text-xs">
                {t("feed.rail.follow")}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className={RAIL_CARD}>
        <RailHeading>{t("feed.rail.peopleYouMayKnow")}</RailHeading>
        <div className="px-4 pb-3">
          <Link
            to="/people"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t("feed.rail.viewNetwork")} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Trending hashtags (gap #1829) — real data, click to filter the feed. */}
      {trendingTags.length > 0 && (
        <section className={RAIL_CARD}>
          <RailHeading>{t("feed.rail.trendingTopics")}</RailHeading>
          <div className="flex flex-wrap gap-2 p-4">
            {trendingTags.map(({ tag, postCount }) => {
              const isActive = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelectTag?.(tag)}
                  title={t("feed.rail.postCount", { count: postCount })}
                  className={cn(
                    "min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-input bg-card text-foreground hover:bg-muted",
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
