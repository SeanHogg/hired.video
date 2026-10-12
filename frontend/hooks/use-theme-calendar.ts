// The ONE reader of the ["theme-calendar","events"] cache entry — the video
// Design tool, the home page's seasonal row and Settings share one request.

import { useQuery } from "@tanstack/react-query";
import { themeCalendarService } from "@/lib/services/theme-calendar-service";
import type { ThemeEvent } from "@shared/theme-calendar/event";

export const THEME_CALENDAR_QUERY_KEY = ["theme-calendar", "events"] as const;

/** Active calendar events; `[]` while loading or on failure (callers fall
 *  back to the Standard theme). */
export function useThemeCalendarEvents(): readonly ThemeEvent[] {
  const { data } = useQuery({
    queryKey: THEME_CALENDAR_QUERY_KEY,
    queryFn: () => themeCalendarService.events(),
    staleTime: 60 * 60_000,
    retry: false,
  });
  return data ?? [];
}
