/**
 * useDefaultVideoTheme — the theme a video wears by default today, for this
 * person: their fixed choice from Settings, else the theme calendar's pick
 * (shared picker, run here so personal dates never leave the browser), else
 * Standard. The ONE resolver every surface uses (video Design tool,
 * Settings preview, home page).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { localToday } from "@shared/theme-calendar/dates";
import { buildPersonContext, type ResumeDates } from "@shared/theme-calendar/person";
import { pickThemeEvent, type ActiveEvent } from "@shared/theme-calendar/pick";
import { themeRegionOf } from "@shared/theme-calendar/region";
import type { VideoPersonalization } from "@shared/video-personalization";
import type { VideoThemeId } from "@shared/video-themes";
import { useThemeCalendarEvents } from "@/hooks/use-theme-calendar";
import { useUserJurisdiction } from "@/hooks/use-user-jurisdiction";
import { useVideoPersonalization } from "@/hooks/use-video-personalization";
import { localized } from "@/lib/theme-calendar/describe";

export interface DefaultVideoTheme {
  themeId: VideoThemeId;
  /** Why: the person's fixed choice, the calendar's pick, or the fallback. */
  source: "fixed" | "date" | "fallback";
  /** The calendar event behind a "date" pick. */
  event: ActiveEvent | null;
  /** Other events running today (offered as choices). */
  others: ActiveEvent[];
  /** The event's opening line in the viewer's language ("" for none). */
  line: string;
}

export function useDefaultVideoTheme(opts: {
  /** Overrides the saved personalization (Settings previews a draft). */
  personalization?: VideoPersonalization;
  resume?: ResumeDates;
  speaksToHiringManager?: boolean;
} = {}): DefaultVideoTheme {
  const { i18n } = useTranslation();
  const events = useThemeCalendarEvents();
  const saved = useVideoPersonalization().personalization;
  const { jurisdiction } = useUserJurisdiction();
  const p = opts.personalization ?? saved;
  const { resume, speaksToHiringManager } = opts;

  return useMemo(() => {
    const today = localToday();
    const person = buildPersonContext({ personalization: p, resume, region: themeRegionOf(jurisdiction), speaksToHiringManager, today });
    const { winner, others } = pickThemeEvent(events, today, person);
    if (p.theme.mode === "fixed") return { themeId: p.theme.themeId, source: "fixed", event: null, others: winner ? [winner, ...others] : others, line: "" };
    if (!winner) return { themeId: "standard", source: "fallback", event: null, others, line: "" };
    return { themeId: winner.event.themeId, source: "date", event: winner, others, line: localized(winner.event.line, i18n.language) };
  }, [events, p, resume, speaksToHiringManager, jurisdiction, i18n.language]);
}
