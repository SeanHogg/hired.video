/**
 * format — the ONE home for frontend display formatters (money, durations,
 * dates, relative times, initials). Calendar-date formatting with the
 * `en-US` "No date"/"Invalid date" contract stays in `@/lib/utils`
 * (`formatDate`); everything else lives here.
 *
 * Helpers that look alike but differ in output are kept as separately named
 * functions on purpose — each name documents its exact output contract.
 */
import { formatDistanceToNow } from "date-fns";
import { formatDuration } from "@shared/duration-format";

export { formatUsdPrice } from "@shared/pricing";
export { formatDuration, durationMinSecParts } from "@shared/duration-format";
export type { DurationStyle, DurationUnit, DurationFormatOptions } from "@shared/duration-format";

// ── Money ────────────────────────────────────────────────────────────────

/** `$12.34` — plain dollar string from cents, no Intl, no currency. */
export function formatCentsPlain(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Marketplace list price from cents: `null` → "Contact for pricing";
 * with `free: true`, `0` → "Free"; otherwise {@link formatCentsPlain}.
 */
export function formatListPriceCents(
  cents: number | null,
  opts: { free?: boolean } = {},
): string {
  if (cents == null) return "Contact for pricing";
  if (opts.free && cents === 0) return "Free";
  return formatCentsPlain(cents);
}

/** Priced item in its own currency (en-US Intl); `0` → "Free". */
export function formatPriceCents(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

/**
 * Money from cents in the browser locale (Intl, `currency` default USD).
 * `fractionDigits` pins min+max fraction digits when given. Falls back to a
 * plain `$x.xx` string when Intl rejects the currency code.
 */
export function formatMoneyCents(
  cents: number,
  currency = "USD",
  fractionDigits?: number,
): string {
  const amount = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      ...(fractionDigits === undefined
        ? {}
        : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

// ── Percentages ──────────────────────────────────────────────────────────

/** A value already on the 0–100 scale → `12.3%` (`fractionDigits` default 1). */
export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

// ── Durations ────────────────────────────────────────────────────────────

/** Seconds → `1h 5m` / `5m 3s` / `3s` (floored, negatives clamp to 0). */
export function formatDurationHms(sec: number): string {
  return formatDuration(sec, { style: "hms" });
}

/** Seconds → `2m 5s` / `5s` (minutes uncapped; remainder seconds rounded). */
export function formatDurationMinSec(sec: number): string {
  return formatDuration(sec, { style: "minSec" });
}

/** Minutes → `45m` / `2h` / `2h 15m`; `null` → `null`. */
export function formatDurationMinutes(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Dates ────────────────────────────────────────────────────────────────

/** Medium date, e.g. "Oct 17, 2026". `locale` undefined = browser default. */
export function formatDateMedium(value: string | Date, locale?: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/** `formatDateMedium` that tolerates a missing / unparseable value ("" then). */
export function formatDateMediumOrEmpty(value: Date | string | null | undefined, locale?: string): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : formatDateMedium(d, locale);
}

/** Browser-locale medium date + time, e.g. "Oct 17, 2026, 3:04 PM". */
export function formatDateTimeMedium(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Browser-default short date; "" for a missing or unparseable timestamp. */
export function formatLocaleDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/**
 * Résumé-style "Oct 2026" (en-US). Empty or the literal "Present" returns the
 * input, or `presentLabel` when empty; an unparseable string is returned as-is.
 */
export function formatMonthYear(dateString: string, presentLabel: string): string {
  if (!dateString || dateString === "Present") return dateString || presentLabel;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

// ── Relative time ────────────────────────────────────────────────────────

/** date-fns "3 days ago"; "" for a missing/invalid timestamp (never throws). */
export function safeRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/** Compact English "just now" / "5m ago" / "3h ago" / "2d ago" (floored). */
export function formatRelativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Initials ─────────────────────────────────────────────────────────────

/** Up to two uppercase initials from the first two words; "?" when empty. */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const tokens = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return (
    tokens
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * First letter of every space-separated word, uppercased, capped at two
 * characters ("" for an empty name). Avatar-fallback contract used by the
 * feed / services surfaces.
 */
export function initialsFromWords(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
