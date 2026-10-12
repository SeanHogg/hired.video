import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ThemeSwatch } from "@/components/video-themes/ThemeSwatch";
import { useInSeason } from "@/hooks/use-in-season";
import { usePublicVideoFeed } from "@/hooks/use-public-video-feed";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { filterVideos } from "@/lib/landing/video-wall";
import { VIDEO_THEMES, videoThemeLabelKey } from "@shared/video-themes";
import { PublicVideoCard } from "./PublicVideoCard";

/**
 * "This fall on hired.video" (Home board): what's in season on the theme
 * calendar, with the posted videos wearing those themes, and a way to make
 * one. Every theme is free. Before anyone has posted in season, the themes
 * themselves show. The band wears the season's own colours (the video
 * palette), so its text is the palette's white/accent in both app themes.
 */
export function HomeSeasonalRail() {
  const { t } = useTranslation();
  const season = useInSeason();
  const { videos } = usePublicVideoFeed();
  if (!season.seasonThemeId || season.themeIds.length === 0) return null;
  const palette = VIDEO_THEMES[season.seasonThemeId];
  const inSeason = filterVideos(videos, "season", season.themeSet);
  const seasonName = season.seasonName ?? t(videoThemeLabelKey(season.seasonThemeId));

  return (
    <section aria-labelledby="landing-season-title" style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`, color: "#FFFFFF" }}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-[0.1em]" style={{ color: palette.accent }}>
              {t("landing.season.eyebrow")}
            </p>
            <h2 id="landing-season-title" className="font-display text-[clamp(26px,3vw,36px)] font-extrabold leading-tight">
              {t("landing.season.title", { season: seasonName })}
            </h2>
            <p className="mt-1 opacity-90">{t("landing.season.subtitle", { list: season.names.join(" · ") })}</p>
          </div>
          <Link
            to={NEW_KIT_PATH}
            className="inline-flex min-h-[44px] items-center rounded-[10px] bg-white px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ color: palette.from }}
          >
            {t("landing.season.cta", { season: seasonName })}
          </Link>
        </div>
        <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1.5">
          {inSeason.length > 0
            ? inSeason.map((v) => (
                <li key={v.id} className="w-40 flex-none">
                  <PublicVideoCard video={v} bare />
                </li>
              ))
            : season.themeIds.map((id) => (
                <li key={id} className="flex w-32 flex-none flex-col gap-2">
                  <ThemeSwatch themeId={id} className="aspect-[9/16] h-auto w-full rounded-[14px] ring-white/20" />
                  <span className="text-sm font-semibold">{t(videoThemeLabelKey(id))}</span>
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}
