/**
 * use-artifact-view-tracking.ts — single seam for "mount a ScrollTracker
 * on this artifact page." Every entity detail page that wants its views
 * counted into the unified creator-stats rollup calls this hook with
 * `{ artifactKind, artifactId }`. Per the DRY rule, callers don't pass
 * a "shouldTrack" gate — the hook self-skips when the id is undefined
 * (page still loading) or when the viewer IS the artifact owner (no
 * point self-inflating your own metrics; the backend also enforces
 * this, the client just saves a round trip).
 *
 * Video pages keep using <VideoTracker> directly — it has per-second
 * playhead semantics the scroll tracker doesn't.
 */

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { ScrollTracker } from "@/lib/analytics/scroll-tracker";
import type { ArtifactKind } from "../../../shared/artifact-views";

interface Options {
  artifactKind: ArtifactKind;
  artifactId: string | null | undefined;
  /** Pass the artifact's owner user id when known so the hook can skip
   *  beacons from the owner. Optional — the backend re-checks owner
   *  identity authoritatively. */
  ownerUserId?: string | null;
}

export function useArtifactViewTracking({
  artifactKind,
  artifactId,
  ownerUserId,
}: Options): void {
  const { user } = useAuth();
  useEffect(() => {
    if (!artifactId) return;
    if (ownerUserId && user?.id && ownerUserId === user.id) return;
    const tracker = new ScrollTracker({ artifactKind, artifactId });
    return tracker.attach();
  }, [artifactKind, artifactId, ownerUserId, user?.id]);
}
