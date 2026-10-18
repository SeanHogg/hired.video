import type { OverridablePlanSlug } from "@/lib/services/superadmin-plan-override-service";
import type { ApiUser, OverrideTokenMode } from "./types";

export const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-accent text-accent-foreground",
  admin:       "bg-accent text-accent-foreground",
  employer:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  recruiter:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  job_seeker:  "bg-muted text-foreground",
};

export const STATUS_COLORS: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  suspended: "bg-red-100 text-red-800",
  banned:    "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200",
  inactive:  "bg-yellow-100 text-yellow-800",
};

/** i18n label key per account status (badge text; CSS capitalises the raw value too). */
export const STATUS_LABEL_KEYS: Record<string, string> = {
  active:    "status.activeStatus",
  suspended: "status.suspendedStatus",
  banned:    "status.bannedStatus",
  inactive:  "status.inactiveStatus",
};

/**
 * Roles offered in the row "Change role" submenu. Affiliate is a service,
 * not a role — to flip affiliate status, use the dedicated affiliate-profile
 * admin surface.
 */
export const ROLE_CHANGE_OPTIONS = ["job_seeker", "employer", "recruiter", "admin"] as const;

/** Page size for the user list. */
export const USER_PAGE_SIZE = 50;

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

export function getUserStatus(u: ApiUser): string {
  if (u.isBanned) return "banned";
  if (u.isSuspended) return "suspended";
  if (u.isActive) return "active";
  return "inactive";
}

/** Active and not suspended — drives the suspend vs. reactivate toggle. */
export function isUserActive(u: ApiUser): boolean {
  return u.isActive && !u.isSuspended;
}

/**
 * Super-admins (and the signed-in admin) can't be bulk-targeted — the server
 * rejects them too, but we hide the checkbox to keep the UI honest.
 */
export function isBulkSelectable(u: ApiUser, currentUserId: string | undefined): boolean {
  return !u.isSuperAdmin && u.id !== currentUserId;
}

/** Plan-override dialog fields derived from a user's existing override (or the "promote to Pro" default). */
export interface OverrideFormState {
  plan: OverridablePlanSlug | "keep";
  tokenMode: OverrideTokenMode;
  tokenCustom: string;
  expires: string;
  reason: string;
}

export function overrideFormFromUser(user: ApiUser): OverrideFormState {
  const existing = user.planOverride;
  if (!existing?.active) {
    return { plan: "pro", tokenMode: "default", tokenCustom: "", expires: "", reason: "" };
  }
  let tokenMode: OverrideTokenMode = "custom";
  let tokenCustom = String(existing.monthlyTokenLimit);
  if (existing.monthlyTokenLimit === null) {
    tokenMode = "default";
    tokenCustom = "";
  } else if (existing.monthlyTokenLimit === -1) {
    tokenMode = "unlimited";
    tokenCustom = "";
  }
  return {
    plan: (existing.planSlug as OverridablePlanSlug) ?? "keep",
    tokenMode,
    tokenCustom,
    expires: existing.expiresAt ? existing.expiresAt.slice(0, 10) : "",
    reason: existing.reason,
  };
}

/** Earliest selectable expiry date (tomorrow) for the override date input. */
export function minOverrideExpiryDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
