// useSocialPublishEntitlement — the ONE seam every social surface self-gates
// from (DRY rule): the Post dock, the connections list, the lane chooser.
// Fetches /api/social/platforms once (optional auth — the server resolves
// lane availability for the caller, or platform state only when signed out)
// and exposes per-platform lane state. Consumers never re-derive "can I post
// to X" from booleans — they ask this hook.
//
// One cached query powers the whole page (react-query dedup), so a view with
// N platform buttons costs one round-trip. Keyed by the viewer so signing in
// (or a guest session starting) re-reads connection state.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  socialService,
  type PlatformAvailability,
} from "@/lib/services/social-service";
import {
  isSocialPostPlatform,
  type SocialPlatform,
  type ManagedLaneState,
  type SelfLaneState,
} from "@shared/social-platforms";

export const socialPlatformsKey = ["social", "platforms"] as const;

export interface PlatformLaneEntitlement {
  meta: PlatformAvailability;
  /** Lane A — post via hired.video (free). `ready` ⇒ live for this user. */
  managed: ManagedLaneState;
  /** Lane B — post to your own account (within the plan's channel cap). */
  self: SelfLaneState;
  selfConnected: boolean;
  /** Convenience flags the surfaces read directly. */
  managedAvailable: boolean;   // free lane usable right now
  selfAvailable: boolean;      // own-account lane usable right now
  selfOffered: boolean;        // the self lane exists here (configured + supported)
  needsConnection: boolean;    // offered but no fresh connection
}

function toEntitlement(p: PlatformAvailability): PlatformLaneEntitlement {
  return {
    meta: p,
    managed: p.managed,
    self: p.self,
    selfConnected: p.selfConnected,
    managedAvailable: p.managed === "ready",
    selfAvailable: p.self === "available",
    selfOffered: p.self === "available" || p.self === "needs_connection",
    needsConnection: p.self === "needs_connection",
  };
}

export function useSocialPublishEntitlement() {
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...socialPlatformsKey, user?.id ?? "anon"],
    queryFn: () => socialService.listPlatforms(),
    enabled: !authLoading,
    staleTime: 60_000,
  });

  const byPlatform = new Map<SocialPlatform, PlatformLaneEntitlement>();
  for (const p of data ?? []) byPlatform.set(p.id, toEntitlement(p));

  return {
    isLoading,
    isError,
    /** Re-read lane state (e.g. after a connect popup finishes). */
    refetch,
    platforms: (data ?? []).map(toEntitlement),
    /** Lane state for one platform (undefined until loaded). */
    forPlatform: (platform: SocialPlatform): PlatformLaneEntitlement | undefined =>
      byPlatform.get(platform),
    /** Should a publish surface show this destination? Social networks only
     *  once the server offers them (developer app configured); every other
     *  destination (YouTube, profile, …) always. */
    offers: (destination: string): boolean =>
      !isSocialPostPlatform(destination) || !!byPlatform.get(destination)?.selfOffered,
  };
}
