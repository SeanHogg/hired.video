/**
 * Direct-post channels for the editor's Post panel — the subset of a media
 * kind's publish destinations (`publishDestinationsFor`, the shared SSoT)
 * that hired.video can post to in one click today, in display order.
 */
import { publishDestinationsFor, type MediaKind } from "@shared/media-kinds";
import type { SocialPostPlatform } from "@shared/social-platforms";

export type ShareChannelId = "youtube" | SocialPostPlatform | "profile";

/** Display order (the Post dock mockup): networks first, the profile last. */
const DIRECT_CHANNELS: readonly ShareChannelId[] = ["linkedin", "youtube", "tiktok", "instagram", "x", "facebook", "profile"];

export function shareChannelsFor(kind: MediaKind): ShareChannelId[] {
  const ids = new Set<string>(publishDestinationsFor(kind).map((d) => d.id));
  return DIRECT_CHANNELS.filter((c) => ids.has(c));
}

/** True when the kind has at least one channel the Post button can reach. */
export function canPostKind(kind: MediaKind): boolean {
  return shareChannelsFor(kind).length > 0;
}
