/**
 * Date helpers for the résumé renderer: display formatting and the
 * "current roles first, then by date" ordering every dated section uses.
 */

export function formatDate(dateString?: string): string {
  if (!dateString) return "";
  if (dateString === "Present") return "Present";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export function dateRange(start?: string, end?: string) {
  const s = formatDate(start);
  const e = formatDate(end || "Present");
  if (!s && !e) return "";
  if (!s) return e;
  return `${s} - ${e}`;
}

// "Current" = no end date or explicit Present. Current roles/education always
// sort ahead of ended ones; within each bucket, date_desc uses end-date (fallback
// start-date) most-recent-first. date_asc inverts both buckets.
function isCurrent(endDate?: string): boolean {
  const v = (endDate ?? "").trim();
  return v === "" || v.toLowerCase() === "present";
}

export function sortByDate<T extends { startDate?: string; endDate?: string }>(
  items: T[],
  order: "date_desc" | "date_asc" | "manual",
) {
  if (order === "manual") return items;
  const desc = order === "date_desc";

  return [...items].sort((a, b) => {
    const aCurrent = isCurrent(a.endDate);
    const bCurrent = isCurrent(b.endDate);

    // Current roles always lead, regardless of sort direction — a "present"
    // entry at the bottom of a work history looks broken either way.
    if (aCurrent && !bCurrent) return -1;
    if (!aCurrent && bCurrent) return 1;

    // Both current → order by start date.
    if (aCurrent && bCurrent) {
      const aStart = new Date(a.startDate || "").getTime();
      const bStart = new Date(b.startDate || "").getTime();
      if (isNaN(aStart) && isNaN(bStart)) return 0;
      if (isNaN(aStart)) return 1;
      if (isNaN(bStart)) return -1;
      return desc ? bStart - aStart : aStart - bStart;
    }

    // Both ended → order by end date, falling back to start date.
    const aEnd = new Date(a.endDate || "").getTime();
    const bEnd = new Date(b.endDate || "").getTime();
    if (!isNaN(aEnd) && !isNaN(bEnd) && aEnd !== bEnd) {
      return desc ? bEnd - aEnd : aEnd - bEnd;
    }
    const aStart = new Date(a.startDate || "").getTime();
    const bStart = new Date(b.startDate || "").getTime();
    if (isNaN(aStart) && isNaN(bStart)) return 0;
    if (isNaN(aStart)) return 1;
    if (isNaN(bStart)) return -1;
    return desc ? bStart - aStart : aStart - bStart;
  });
}
