// Pure formatting helpers shared by the programmatic SEO pages
// (/salary, /salary/:role[/:city], /resume-guide/:role).

/** Whole-dollar USD amount in the viewer's locale; "N/A" for missing/zero. */
export function formatUsd(n: number | null | undefined, locale?: string): string {
  if (!n) return "N/A";
  return new Intl.NumberFormat(locale || "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** "senior-data-engineer" → "Senior Data Engineer". */
export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "data engineer" → "Data Engineer" (whitespace-separated). */
export function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
