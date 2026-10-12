/**
 * Document date formatting — the read/export renderer's humanized dates
 * ("2019-03" → "Mar 2019") and "Start – End" ranges. Split from
 * DocumentView.tsx so the section views and tests share one helper.
 */
import { intlLocale } from "@shared/i18n";

/** "2019-03" / "2019-03-21" → "Mar 2019" (in `locale`); anything else
 *  passes through. */
export function formatDocDate(raw: unknown, locale = "en"): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw.trim());
  if (!m) return raw.trim();
  const month = Number(m[2]);
  if (month < 1 || month > 12) return raw.trim();
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(m[1]), month - 1, 1)),
  );
}

/** A formatted "Start – End" range, "Start – <present>" when the end is blank. */
export function formatDateRange(start: unknown, end: unknown, locale = "en", present = "Present"): string {
  const s = formatDocDate(start, locale);
  const e = formatDocDate(end, locale);
  if (!s && !e) return "";
  if (s && !e) return `${s} – ${present}`;
  if (!s && e) return e;
  return `${s} – ${e}`;
}
