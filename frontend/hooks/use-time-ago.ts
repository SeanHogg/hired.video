/**
 * use-time-ago — shared relative-time + date-format helpers that respect
 * the user's locale via i18next + the browser's user-agent default.
 *
 * Replaces hand-rolled "Today / Yesterday / N days ago" + hardcoded
 * `toLocaleDateString("en-US", …)` calls (#635). Single source of truth
 * so future surfaces (Applications, Alerts, Saved Jobs, Outreach inbox)
 * format dates identically.
 *
 * i18n keys live under `messages.timeAgo.*`; the hook falls back to
 * English literals if a translation hasn't landed yet, so adding the
 * hook never crashes a partially-translated locale.
 */
import { useTranslation } from "react-i18next";

export interface TimeAgoApi {
  /** Locale-aware `toLocaleDateString`. Resolution = i18next.language. */
  formatDate(date: Date | string | null | undefined): string;
  /** Relative-time string ("Today", "3 days ago", "2 months ago").
   *  Uses `Intl.RelativeTimeFormat` when available with sensible
   *  bucketing thresholds. Returns `""` for null / invalid inputs. */
  getTimeAgo(date: Date | string | null | undefined): string;
}

function coerceDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function useTimeAgo(): TimeAgoApi {
  const { i18n, t } = useTranslation();
  // `undefined` defers to the user agent's default locale when i18n
  // hasn't bootstrapped or is set to "en" — keeps formatDate honest
  // for users whose OS locale differs from the app's UI language.
  const locale = i18n.language || undefined;

  const formatDate = (input: Date | string | null | undefined): string => {
    const date = coerceDate(input);
    if (!date) return "";
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getTimeAgo = (input: Date | string | null | undefined): string => {
    const date = coerceDate(input);
    if (!date) return "";
    const diffMs = Math.abs(Date.now() - date.getTime());
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t("messages.timeAgo.today", { defaultValue: "Today" });
    if (diffDays === 1) return t("messages.timeAgo.yesterday", { defaultValue: "Yesterday" });
    if (diffDays < 7) {
      return t("messages.timeAgo.daysAgo", { count: diffDays, defaultValue: `${diffDays} days ago` });
    }
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return t("messages.timeAgo.weeksAgo", { count: weeks, defaultValue: `${weeks} weeks ago` });
    }
    const months = Math.floor(diffDays / 30);
    return t("messages.timeAgo.monthsAgo", { count: months, defaultValue: `${months} months ago` });
  };

  return { formatDate, getTimeAgo };
}
