import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { usePublicVideoFeed } from "@/hooks/use-public-video-feed";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { useInSeason } from "@/hooks/use-in-season";
import { filterVideos, wallFilters, wallItems, type WallFilter } from "@/lib/landing/video-wall";
import { cn } from "@/lib/utils";
import { HOME_ANCHOR_IDS } from "@/lib/nav/public-nav";
import { PublicVideoCard } from "./PublicVideoCard";

/** "Your video goes here" — the wall's invite card (9:16, same slot size). */
function YourVideoCard() {
  const { t } = useTranslation();
  return (
    <Link
      to={NEW_KIT_PATH}
      className="flex aspect-[9/16] flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-primary/40 bg-card p-4 text-center text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
        <Plus className="h-6 w-6" />
      </span>
      <b className="font-display text-xl font-extrabold leading-tight">{t("landing.wall.ctaTitle")}</b>
      <span className="text-[13px] text-muted-foreground">{t("landing.wall.ctaBody")}</span>
      <span className="rounded-[9px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground">
        {t("landing.wall.ctaButton")}
      </span>
    </Link>
  );
}

/**
 * "Watch people get seen" — the home page's wall of real posted videos
 * (newest first, from the public feed), with the invite card in slot 3.
 * Before anyone has posted, only the invite card shows.
 */
export function HomeVideoWall() {
  const { t } = useTranslation();
  const { videos } = usePublicVideoFeed();
  const season = useInSeason();
  const [filter, setFilter] = useState<WallFilter>("all");
  const filters = wallFilters(videos, season.themeSet);
  const active = filters.includes(filter) ? filter : "all";
  const items = wallItems(filterVideos(videos, active, season.themeSet));

  return (
    <MarketingBand id={HOME_ANCHOR_IDS.watch} labelledBy="landing-wall-title" className="flex flex-col gap-6 py-16 sm:py-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <MarketingSectionIntro id="landing-wall-title" title={t("landing.wall.title")} />
          <p className="text-muted-foreground">{t("landing.wall.subtitle")}</p>
        </div>
      </div>
      {filters.length > 0 && (
        <div role="group" aria-label={t("landing.wall.filterLabel")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={active === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-[36px] flex-none whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold",
                active === f ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {f === "all"
                ? t("landing.wall.filter.all")
                : f === "season"
                  ? t("landing.wall.filter.season", { season: season.seasonName ?? t("landing.wall.filter.inSeason") })
                  : t(`landing.wall.filter.${f}`)}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        {items.map((item) => (
          <li key={item.kind === "cta" ? "cta" : item.video.id} className="min-w-0">
            {item.kind === "cta" ? <YourVideoCard /> : <PublicVideoCard video={item.video} />}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">{t("landing.wall.footnote")}</p>
    </MarketingBand>
  );
}
