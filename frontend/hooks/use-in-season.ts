// What's in season on the theme calendar right now, for the visitor's
// region — the home page's seasonal row and the wall's "season" filter.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { localToday } from "@shared/theme-calendar/dates";
import { inSeasonEvents } from "@shared/theme-calendar/pick";
import { themeRegionOf } from "@shared/theme-calendar/region";
import type { VideoThemeId } from "@shared/video-themes";
import { useThemeCalendarEvents } from "@/hooks/use-theme-calendar";
import { useUserJurisdiction } from "@/hooks/use-user-jurisdiction";
import { localized } from "@/lib/theme-calendar/describe";

export interface InSeason {
  /** Themes in season, best first. */
  themeIds: VideoThemeId[];
  themeSet: ReadonlySet<string>;
  /** Event names in season ("Fall · Cider & pumpkins", "Halloween"). */
  names: string[];
  /** The season itself (Fall, Winter…), when one is running. */
  seasonName: string | null;
  seasonThemeId: VideoThemeId | null;
}

export function useInSeason(): InSeason {
  const { i18n } = useTranslation();
  const events = useThemeCalendarEvents();
  const { jurisdiction } = useUserJurisdiction();
  return useMemo(() => {
    const active = inSeasonEvents(events, localToday(), themeRegionOf(jurisdiction));
    const themeIds = [...new Set(active.map((a) => a.event.themeId))];
    const season = active.find((a) => a.event.kind === "season") ?? null;
    return {
      themeIds,
      themeSet: new Set(themeIds),
      names: active.map((a) => localized(a.event.name, i18n.language)),
      seasonName: season ? localized(season.event.name, i18n.language).split(" · ")[0] : null,
      seasonThemeId: season?.event.themeId ?? null,
    };
  }, [events, jurisdiction, i18n.language]);
}
