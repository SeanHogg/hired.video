// studio-quota.ts — single source of truth for the free-tier video quota.
//
// Same gate is consulted by:
//   • /api/studio/upload   — refuses the request server-side when over quota
//   • The studio UI         — disables Save (and skips the API call) when
//                              the client already knows the user is over
//
// Until this module landed, the gate lived only on the server, so the
// client happily POSTed an upload request that was always going to 402,
// and SuperAdmins (who should never hit a free-tier limit) saw a
// "QUOTA_EXCEEDED" toast on their own dev instance.

/** How many videos a free user can publish. Past this they hit the quota. */
export const FREE_VIDEO_QUOTA = 1;

export interface QuotaInputs {
  /** True for paid Pro subscribers. */
  isPro: boolean;
  /** True for staff with the SUPER_ADMIN role. Bypasses every quota gate. */
  isSuperAdmin: boolean;
  /** Number of distinct projects the user already has a published video on,
   *  EXCLUDING the project being edited (re-uploads to the same project
   *  replace the existing video and don't count). */
  publishedVideoCount: number;
}

export interface QuotaDecision {
  /** True when the user is allowed to publish another video. */
  allowed: boolean;
  /** Stable reason code for tests + telemetry. "ok" when allowed. */
  reason: "ok" | "pro" | "super-admin" | "free-quota-exceeded";
}

/**
 * Pure decision function. Pro users + SuperAdmins always pass; free users
 * pass only while strictly under the quota. The reason code lets callers
 * distinguish "unlimited because Pro" from "unlimited because staff" for
 * UI / telemetry without leaking the underlying claim.
 */
export function decideStudioQuota(input: QuotaInputs): QuotaDecision {
  if (input.isSuperAdmin) return { allowed: true, reason: "super-admin" };
  if (input.isPro)        return { allowed: true, reason: "pro" };
  if (input.publishedVideoCount < FREE_VIDEO_QUOTA) {
    return { allowed: true, reason: "ok" };
  }
  return { allowed: false, reason: "free-quota-exceeded" };
}
