// Pure helpers for the mono meta line on reading pages
// ("MAR 4, 2026 · 6 MIN READ · RESUME TIPS"). Shared by blog posts,
// articles, help articles and guides so dates and separators format the
// same way everywhere.

export type ContentDateStyle = "long" | "short";

/**
 * Locale-formatted calendar date for an ISO date/datetime string. Accepts
 * date-only values ("2026-03-04") and full timestamps. Returns null for
 * missing or unparseable input so callers can drop the meta segment.
 * Date-only strings are formatted in UTC so "2026-03-04" never renders as
 * Mar 3 in a negative-offset timezone.
 */
export function formatContentDate(
  value: string | null | undefined,
  locale: string,
  style: ContentDateStyle = "long",
): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale || "en", {
      year: "numeric",
      month: style === "long" ? "long" : "short",
      day: "numeric",
      ...(dateOnly ? { timeZone: "UTC" } : {}),
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Separator used between meta segments. */
export const META_SEPARATOR = " · ";

/** Join the non-empty segments of a meta line with the shared separator. */
export function joinMeta(parts: ReadonlyArray<string | number | null | undefined | false>): string {
  return parts
    .filter((p): p is string | number => p !== null && p !== undefined && p !== false && `${p}`.trim() !== "")
    .map((p) => `${p}`.trim())
    .join(META_SEPARATOR);
}

/** True when an "updated" date is a different calendar day from the publish date. */
export function wasUpdated(publishedAt: string | null | undefined, updatedAt: string | null | undefined): boolean {
  if (!publishedAt || !updatedAt) return false;
  return publishedAt.slice(0, 10) !== updatedAt.slice(0, 10);
}
