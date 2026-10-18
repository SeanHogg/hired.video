/** Timezone-aware local-date helpers used to pad availability-override reads. */

export function localDate(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function dateOnlyAddDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split("-").map((x) => Number.parseInt(x, 10));
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  const out = new Date(t);
  const yy = out.getUTCFullYear().toString().padStart(4, "0");
  const mm = (out.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = out.getUTCDate().toString().padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
