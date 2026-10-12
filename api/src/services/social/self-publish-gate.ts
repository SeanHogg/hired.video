/**
 * runSelfPublishGate — the ONE Lane-B gate (post to the user's own account)
 * every network's publish runs through, YouTube included:
 *
 *   1. entitlement   the plan's channel cap allows this destination
 *                    (guest 1 → free account 2 → Pro unlimited; re-posting to
 *                    a destination the video is already on never counts twice)
 *   2. connection    the user has a connection for the platform
 *   3. token refresh it yields a fresh access token (refresh on expiry)
 *
 * It answers a typed envelope instead of throwing, so the route maps each
 * kind to the inline prompt the client renders (upgrade vs connect again).
 * The publish itself stays with the caller (publish-project-video.ts).
 */
import type { VideoPublishPlatform } from "../../../../shared/social-platforms.js";
import { canPostToDestination } from "../studio/post-channel-gate.js";
import type { SelfTokenSource } from "./build-social-publisher.js";

export interface SelfPublishGateInput {
  actor: { userId: string; isGuest: boolean };
  projectId: string;
  platform: VideoPublishPlatform;
}

export type SelfPublishGateResult =
  | { ok: true; accessToken: string }
  | { ok: false; kind: "CHANNEL_LIMIT" | "NOT_CONNECTED" };

export interface SelfPublishGateDeps {
  canPost?: typeof canPostToDestination;
  selfAccessToken: SelfTokenSource;
}

export async function runSelfPublishGate(
  { actor, projectId, platform }: SelfPublishGateInput,
  deps: SelfPublishGateDeps,
): Promise<SelfPublishGateResult> {
  const canPost = deps.canPost ?? canPostToDestination;
  // Entitlement first: an over-cap post never touches the user's tokens.
  if (!(await canPost({ userId: actor.userId, isGuest: actor.isGuest, projectId, destination: platform }))) {
    return { ok: false, kind: "CHANNEL_LIMIT" };
  }
  const accessToken = await deps.selfAccessToken(actor.userId, platform);
  if (!accessToken) return { ok: false, kind: "NOT_CONNECTED" };
  return { ok: true, accessToken };
}
