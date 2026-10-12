/**
 * Presentation helpers for theme-calendar events: the viewer's-language copy
 * of SuperAdmin-authored text, and a translatable description of a date rule
 * ("3rd Saturday in October"). Pure — callers pass `t` and the language.
 */
import type { TFunction } from "i18next";
import { dayOf, isoOf, yearOf, type DayNumber } from "@shared/theme-calendar/dates";
import type { DateRule, LocalizedText, ThemeEvent } from "@shared/theme-calendar/event";
import { mainDayIn, NO_PERSON } from "@shared/theme-calendar/pick";

/** The text in the viewer's language, falling back to English. */
export function localized(text: LocalizedText | null | undefined, language: string): string {
  if (!text) return "";
  const lang = language === "fr" ? "fr-CA" : language;
  return (text as Record<string, string | undefined>)[lang] || text.en;
}

/** "Oct 31" in the viewer's locale for a day number. */
export function formatDay(day: DayNumber, language: string): string {
  return new Date(`${isoOf(day)}T12:00:00Z`).toLocaleDateString(language, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** A month name in the viewer's locale (1–12). */
export function monthName(month: number, language: string): string {
  return new Date(Date.UTC(2026, month - 1, 15)).toLocaleDateString(language, { month: "long", timeZone: "UTC" });
}

/** A weekday name in the viewer's locale (0 = Sunday). */
export function weekdayName(weekday: number, language: string): string {
  // 2026-01-04 is a Sunday.
  return new Date(Date.UTC(2026, 0, 4 + weekday)).toLocaleDateString(language, { weekday: "long", timeZone: "UTC" });
}

/** How the main day is set, in words. */
export function describeRule(rule: DateRule, t: TFunction, language: string): string {
  switch (rule.type) {
    case "fixed":
      return t("themeCalendar.rule.fixedOn", { date: formatDay(dayOf(2026, rule.month, rule.day), language) });
    case "nthWeekday":
      return t(rule.nth === -1 ? "themeCalendar.rule.lastWeekday" : "themeCalendar.rule.nthWeekdayOf", {
        nth: rule.nth,
        ordinal: t(`themeCalendar.ordinal.${rule.nth}`),
        weekday: weekdayName(rule.weekday, language),
        month: monthName(rule.month, language),
      });
    case "computed":
      return t(`themeCalendar.rule.computed.${rule.point}`);
    case "table":
      return t("themeCalendar.rule.table");
    case "person":
      return t(`themeCalendar.rule.person.${rule.moment}`);
  }
}

/** The event's main day this year (null for personal or unset dates). */
export function mainDayThisYear(event: ThemeEvent, today: DayNumber): DayNumber | null {
  return mainDayIn(event, yearOf(today), NO_PERSON);
}
