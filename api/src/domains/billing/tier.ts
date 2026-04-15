/**
 * Ubiquitous language for the subscription tiers used by the tier policy.
 *
 * Deliberately coarser than the raw `SubscriptionSummaryDTO` — tool
 * handlers only need to know "which policy applies to this caller?",
 * not the billing plan's internal shape. Deriving `Tier` from the DTO
 * lives in one place (`deriveTier`) so pricing changes touch the
 * derivation, not the 10+ tool routes.
 *
 * Roadmap #150.
 */

import type { SubscriptionSummaryDTO } from "../../../../shared/billing.js";
import type { JwtPayload } from "../../types/index.js";

/**
 * The four ubiquitous tiers. Ordered roughly from least to most
 * privileged — compare with `>=` is NOT safe; always dispatch through
 * the policy. The enum deliberately avoids the legacy "Premium" name —
 * Pro is the canonical term (see roadmap #151).
 */
export type Tier = "anonymous" | "free" | "pro" | "admin";

/**
 * Roles that bypass tier gating entirely. SuperAdmin and Admin users
 * are internal — they always get the full experience regardless of
 * subscription state, matching the existing behavior in
 * `checkTokenBudget` and `requirePremium`.
 */
export function isAdminRole(user: JwtPayload | null | undefined): boolean {
  if (!user) return false;
  const roles = user.roles ?? [];
  const role = (user as any).role ?? "";
  return (
    roles.includes("SuperAdmin") ||
    roles.includes("Admin") ||
    role === "SuperAdmin" ||
    role === "Admin" ||
    user.isSuperAdmin === true
  );
}

/**
 * Derive the coarse tier from the auth context and billing DTO.
 *
 * - No user on the context → `anonymous`
 * - Admin/SuperAdmin role (regardless of billing) → `admin`
 * - `sub.isPremium === true` → `pro`
 * - Otherwise → `free`
 *
 * This is the single point where billing → policy translation happens.
 * Tool routes must never inspect `sub.isPremium` directly — use the
 * facade, which calls this.
 */
export function deriveTier(
  user: JwtPayload | null | undefined,
  sub: SubscriptionSummaryDTO | null | undefined,
): Tier {
  if (!user) return "anonymous";
  if (isAdminRole(user)) return "admin";
  if (sub?.isPremium) return "pro";
  return "free";
}
