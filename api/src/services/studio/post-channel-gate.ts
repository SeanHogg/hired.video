/**
 * Post-channel entitlement — the server half of the Post dock's channel cap.
 *
 * One video may go out to `postChannelLimit` destinations (shared/pricing:
 * guest 1 → free account 2 → Pro unlimited). The ledger is the project's
 * publication records (publication-service — one row per destination), so
 * re-posting to a destination the video is already on never counts twice and
 * un-publishing frees the slot.
 *
 * Called at every path that actually publishes (going live on the profile,
 * and the self-publish gate every network's post runs through — YouTube,
 * TikTok, Instagram, X, Facebook, LinkedIn) BEFORE the external call, so a
 * client that skips the dock's lock still can't exceed the plan.
 */
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { getSubscription } from "../billing/BillingService.js";
import { listPublications } from "./publication-service.js";
import { postChannelLimit } from "../../../../shared/pricing.js";
import { TIER_COPY, UPGRADE_URL } from "../../../../shared/tier-copy.js";

export interface PostChannelCheck {
  userId: string;
  /** Silent guest session (JWT `guest` claim). */
  isGuest: boolean;
  projectId: string;
  destination: string;
}

/** Pure rule: may a post reach `destination` given where the video already is? */
export function exceedsPostChannelLimit(
  publishedDestinations: readonly string[],
  destination: string,
  limit: number,
): boolean {
  const others = new Set(publishedDestinations.filter((d) => d !== destination));
  return others.size >= limit;
}

/** Lookups behind the cap — injectable so the plan rule is testable without a DB. */
export interface PostChannelDeps {
  isPro?: (userId: string) => Promise<boolean>;
  listPublications?: (projectId: string) => Promise<Array<{ destination: string; status: string }>>;
}

export async function canPostToDestination(
  { userId, isGuest, projectId, destination }: PostChannelCheck,
  deps: PostChannelDeps = {},
): Promise<boolean> {
  const isPro = deps.isPro ? await deps.isPro(userId) : (await getSubscription(userId)).isPro;
  const limit = postChannelLimit({ isPro, hasAccount: !isGuest });
  if (!Number.isFinite(limit)) return true;
  const published = (await (deps.listPublications ?? listPublications)(projectId))
    .filter((p) => p.status === "published")
    .map((p) => p.destination);
  return !exceedsPostChannelLimit(published, destination, limit);
}

/**
 * Route helper: `null` when the post may go ahead, else the 402 PRO_REQUIRED
 * envelope (the code the frontend's upgrade prompts already match on).
 */
export async function postChannelGate(
  c: Context<AppEnv>,
  projectId: string,
  destination: string,
): Promise<Response | null> {
  const user = c.var.user;
  const allowed = await canPostToDestination({
    userId: user.sub,
    isGuest: !!user.guest,
    projectId,
    destination,
  });
  return allowed ? null : channelLimitResponse(c);
}

/** The 402 PRO_REQUIRED envelope for "this post would exceed the plan's
 *  channel cap" — the code the frontend's upgrade prompts already match on. */
export function channelLimitResponse(c: Context<AppEnv>): Response {
  return c.json(
    {
      success: false,
      error: {
        code: "PRO_REQUIRED",
        message: TIER_COPY.proFeatureRequired("Posting to more channels"),
        upgradeUrl: UPGRADE_URL,
      },
    },
    402,
  );
}
