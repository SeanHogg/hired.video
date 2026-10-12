/**
 * Promotion queue — "Lane A" of the social-publishing PRD
 * (docs/prd/social-media-publishing-and-distribution.md §5.3, gap #2046).
 *
 * A creator submits a rendered Studio project; a SuperAdmin approves it and
 * it is published under hired.video's managed brand account for the chosen
 * platform (`managed_accounts`). The creator's own hired.video pages stay the
 * always-available destination; promotion is the curated extra reach.
 *
 * A new SOCIAL_POST_PLATFORMS adapter that can also post for the brand
 * account joins MANAGED_POST_PLATFORMS below (the publisher registry is
 * typed over PROMOTION_PLATFORMS, so a missing entry is a compile error);
 * widen the migration CHECK alongside it.
 */
import type { SocialPostPlatform } from "./social-platforms.js";

/** Lane-B post adapters that also work with the brand account's token.
 *  LinkedIn is left out: its brand account is a Company Page, which posts
 *  as an organization URN (Community Management API), while the LinkedIn
 *  adapter posts as the token's member. */
export const MANAGED_POST_PLATFORMS = ["tiktok", "instagram", "x", "facebook"] as const satisfies readonly SocialPostPlatform[];
export type ManagedPostPlatform = (typeof MANAGED_POST_PLATFORMS)[number];

/** Managed-lane platforms with a server-side publisher: YouTube (Data API
 *  upload) plus the Lane-B adapters that can post for the brand. */
export const PROMOTION_PLATFORMS = ["youtube", ...MANAGED_POST_PLATFORMS] as const;
export type PromotionPlatform = (typeof PROMOTION_PLATFORMS)[number];

export function isPromotionPlatform(v: string): v is PromotionPlatform {
  return (PROMOTION_PLATFORMS as readonly string[]).includes(v);
}

/**
 *  pending   → waiting for SuperAdmin review
 *  published → approved and live on the brand account
 *  failed    → approved but the platform upload failed (retryable)
 *  rejected  → declined by a SuperAdmin (reason shown to the creator)
 */
export const PROMOTION_STATUSES = ["pending", "published", "failed", "rejected"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export function isPromotionStatus(v: string): v is PromotionStatus {
  return (PROMOTION_STATUSES as readonly string[]).includes(v);
}

export const PROMOTION_TITLE_MAX = 100;
export const PROMOTION_DESCRIPTION_MAX = 4000;
