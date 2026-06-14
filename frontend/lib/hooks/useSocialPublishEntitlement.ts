// useSocialPublishEntitlement — the ONE seam the publish lane chooser
// self-gates from (DRY rule). Fetches /api/social/platforms once (server
// resolves lane availability for the caller) and exposes per-platform lane
// state. Consumers never re-derive "can I post to X" from booleans — they
// ask this hook, and the shared <PublishLaneChooser> (Phase 2) decides its
// own visibility from the returned state.
//
// One cached query powers the whole page (react-query dedup), so a Studio
// view with N platform buttons costs one round-trip.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  socialService,
  type PlatformAvailability,
} from "@/lib/services/social-service";
import type {
  SocialPlatform,
  ManagedLaneState,
  SelfLaneState,
} from "@shared/social-platforms";

export const socialPlatformsKey = ["social", "platforms"] as const;

export interface PlatformLaneEntitlement {
  meta: PlatformAvailability;
  /** Lane A — post via hired.video (free). `ready` ⇒ live for this user. */
  managed: ManagedLaneState;
  /** Lane B — post to your own account (Pro-gated). */
  self: SelfLaneState;
  selfConnected: boolean;
  /** Convenience flags the chooser reads directly. */
  managedAvailable: boolean;   // free lane usable right now
  selfAvailable: boolean;      // own-account lane usable right now
  needsUpgrade: boolean;       // self lane blocked purely on Pro entitlement
  needsConnection: boolean;    // entitled but no fresh connection
}

function toEntitlement(p: PlatformAvailability): PlatformLaneEntitlement {
  return {
    meta: p,
    managed: p.managed,
    self: p.self,
    selfConnected: p.selfConnected,
    managedAvailable: p.managed === "ready",
    selfAvailable: p.self === "available",
    needsUpgrade: p.self === "needs_pro",
    needsConnection: p.self === "needs_connection",
  };
}

export function useSocialPublishEntitlement() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: socialPlatformsKey,
    queryFn: () => socialService.listPlatforms(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const byPlatform = new Map<SocialPlatform, PlatformLaneEntitlement>();
  for (const p of data ?? []) byPlatform.set(p.id, toEntitlement(p));

  return {
    isLoading,
    isError,
    platforms: (data ?? []).map(toEntitlement),
    /** Lane state for one platform (undefined until loaded). */
    forPlatform: (platform: SocialPlatform): PlatformLaneEntitlement | undefined =>
      byPlatform.get(platform),
  };
}
