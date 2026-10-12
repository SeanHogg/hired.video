/**
 * #109 / #1769 — Ad-set targeting evaluator + audience reach estimator.
 *
 * Two kinds of rule, two places they are decided:
 *   - user attributes (geo, skills, experience, activity, exclusions) are
 *     a SQL predicate (targeting-sql.ts) run by Postgres — never a per-user
 *     in-memory filter;
 *   - serving context (device, daypart) belongs to the request, so it is a
 *     pure check against the request (`matchesServingContext`).
 *
 * `evaluateUserAgainstTargeting` (render time) and `estimateActualReach`
 * (inspector) share the same predicate builder, so the reach an advertiser
 * is shown is exactly the audience the ad renders to.
 */

import { getDb } from "../../db/index.js";
import {
  estimateAudienceBucket,
  type AdSetTargeting,
  type AudienceSizeEstimate,
  type DayOfWeek,
  type DevicePlatform,
} from "../../../../shared/ad-targeting.js";
import { AdTargetingRepository } from "../../repositories/adTargetingRepository.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { buildTargetingWhere } from "./targeting-sql.js";

export interface EligibilityDecision {
  eligible: boolean;
  /** Diagnostic list of reasons we filtered the user out. */
  reasons: string[];
}

/** What the serving request knows about the impression. */
export interface ServingContext {
  device?: DevicePlatform | null;
  /** IANA zone of the viewer (Workers: `request.cf.timezone`). */
  viewerTimezone?: string | null;
  now?: Date;
}

/** Coarse device class from a User-Agent string. */
export function deviceFromUserAgent(ua: string | null | undefined): DevicePlatform | null {
  if (!ua) return null;
  if (/iPad|Tablet|Nexus (7|9|10)|SM-T\d|Kindle|Silk/i.test(ua)) return "tablet";
  if (/Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
}

const WEEKDAY_INDEX: Record<string, DayOfWeek> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local hour (0-23) + weekday in `timeZone`; UTC when the zone is unknown. */
function localClock(now: Date, timeZone: string): { hour: number; day: DayOfWeek } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const day = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? ""];
    if (Number.isInteger(hour) && day !== undefined) return { hour, day };
  } catch {
    // Unknown zone — fall through to UTC.
  }
  return { hour: now.getUTCHours(), day: now.getUTCDay() as DayOfWeek };
}

/** Device + daypart rules against the serving request. Pure. */
export function matchesServingContext(targeting: AdSetTargeting, ctx: ServingContext = {}): EligibilityDecision {
  const reasons: string[] = [];
  const platforms = targeting.device?.platforms;
  if (platforms?.length && ctx.device && !platforms.includes(ctx.device)) {
    reasons.push(`device ${ctx.device} not targeted`);
  }
  const dp = targeting.dayparting;
  if (dp?.hoursOfDay?.length || dp?.daysOfWeek?.length) {
    const zone = dp.timezone ?? ctx.viewerTimezone ?? "UTC";
    const { hour, day } = localClock(ctx.now ?? new Date(), zone);
    if (dp.hoursOfDay?.length && !dp.hoursOfDay.includes(hour)) reasons.push(`hour ${hour} outside daypart`);
    if (dp.daysOfWeek?.length && !dp.daysOfWeek.includes(day)) reasons.push(`day ${day} outside daypart`);
  }
  return { eligible: reasons.length === 0, reasons };
}

function repoOf(repo?: AdTargetingRepository): AdTargetingRepository {
  return repo ?? new AdTargetingRepository(getDb());
}

/** Render-time eligibility for one viewer: serving context first (free),
 *  then ONE SQL query for the user-attribute predicate. */
export async function evaluateUserAgainstTargeting(
  userId: string,
  targeting: AdSetTargeting,
  ctx: ServingContext = {},
  repo?: AdTargetingRepository,
): Promise<EligibilityDecision> {
  const context = matchesServingContext(targeting, ctx);
  if (!context.eligible) return context;
  const reached = await repoOf(repo).isReachable(userId, buildTargetingWhere(targeting, ctx.now));
  return reached ? { eligible: true, reasons: [] } : { eligible: false, reasons: ["outside targeted audience"] };
}

/** Stable JSON (sorted keys, empty values dropped) so equal specs hash equal. */
export function canonicalTargeting(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const inner = norm((v as Record<string, unknown>)[k]);
        if (inner === undefined || (Array.isArray(inner) && inner.length === 0)) continue;
        if (inner && typeof inner === "object" && !Array.isArray(inner) && Object.keys(inner).length === 0) continue;
        out[k] = inner;
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value) ?? {});
}

export async function targetingCacheKey(targeting: AdSetTargeting): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalTargeting(targeting));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `ad-reach:v1:${hex}`;
}

export interface ReachEstimate {
  /** Users the user-attribute predicate reaches right now. */
  reach: number;
  /** Bucketed label (also reflects device / daypart narrowing). */
  bucket: AudienceSizeEstimate["bucket"];
}

/** Reach shifts slowly (sign-ups, profile edits); a 10-minute TTL keeps the
 *  inspector live without re-counting on every keystroke. Nothing writes a
 *  spec-keyed value, so there is no write to invalidate on. */
const REACH_TTL_SECONDS = 600;

export async function estimateActualReach(
  targeting: AdSetTargeting,
  repo?: AdTargetingRepository,
): Promise<ReachEstimate> {
  const key = await targetingCacheKey(targeting);
  return getOrSetCached<ReachEstimate>({
    key,
    ttlSeconds: REACH_TTL_SECONDS,
    loader: async () => ({
      reach: await repoOf(repo).countReachable(buildTargetingWhere(targeting)),
      bucket: estimateAudienceBucket(targeting).bucket,
    }),
  });
}
