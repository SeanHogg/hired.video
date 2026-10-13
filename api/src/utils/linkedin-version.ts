/**
 * The `LinkedIn-Version` header (YYYYMM) — ONE source for every LinkedIn
 * REST call (social posting, Marketing API adapter, Conversions API).
 *
 * LinkedIn ships a version every month and retires each about a year after
 * release; a request naming a retired one fails `426 NONEXISTENT_VERSION`.
 * Pinned constants rotted exactly that way (202404, then 202509 — every
 * LinkedIn post failed on 2026-10-13). So the version follows the calendar:
 * two months back is always released and stays active for ~10 more months.
 *
 * `LINKEDIN_API_VERSION` still overrides it (to hold a version while testing
 * a migration), but only while that version is inside the active window — a
 * forgotten override can't take posting down again.
 */
import { getEnv } from "./env.js";

/** Months back from now the derived version sits (released, not retiring). */
export const VERSION_LAG_MONTHS = 2;
/** LinkedIn keeps a version active for at least this many months. */
export const ACTIVE_WINDOW_MONTHS = 11;

function monthIndex(yyyymm: string): number | null {
  const m = /^(\d{4})(0[1-9]|1[0-2])$/.exec(yyyymm);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

function toVersion(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}${String(month).padStart(2, "0")}`;
}

export function linkedInApiVersion(now: Date = new Date(), override: string | undefined = getEnv("LINKEDIN_API_VERSION")): string {
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const pinned = override ? monthIndex(override.trim()) : null;
  if (pinned !== null && pinned <= current && current - pinned < ACTIVE_WINDOW_MONTHS) return toVersion(pinned);
  return toVersion(current - VERSION_LAG_MONTHS);
}
