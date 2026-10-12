/**
 * InteractionZonesOverlay — the ONE playback overlay that makes a playing
 * canvas clickable (#2312). Every zone comes from the Timeline through the
 * widget registry (`useInteractionZones` → each plugin's `interactions`);
 * this component only projects them onto the controls that act on them:
 *
 *   • cta         → `CtaHotzonesOverlay` anchors (fires the cta-click
 *                   tracker when `analyticsProjectId` is set)
 *   • engagement  → `EngagementZonesOverlay` (forms, chapters, thumbnails,
 *                   review pins — audience rules live there)
 *
 * Mount it inside the stage-sized box so fractional zones line up with the
 * rendered frame. Self-gating: each child renders null with nothing active.
 */
import { useMemo } from "react";
import type { CtaHotzone } from "@shared/cta-hotzones";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { engagementZonesOf } from "@/lib/studio/engagement/engagement-zones";
import { resolveCtaHotzones } from "@/lib/studio/widgets/interactions";
import { useInteractionZones } from "@/lib/studio/widgets/use-interaction-zones";
import CtaHotzonesOverlay from "./CtaHotzonesOverlay";
import EngagementZonesOverlay, { type EngagementPlaybackControls } from "./EngagementZonesOverlay";

export interface InteractionZonesOverlayProps {
  state: CanvasState;
  playback: EngagementPlaybackControls;
  /** The public payload's CTA hot-zones (`/api/studio/public/:id`), with
   *  the project's campaign UTMs baked into their URLs by the API. When
   *  supplied they REPLACE the client-derived CTA zones — same Timeline,
   *  same `ctaUrlFromParams` rule, but only the API knows the campaign.
   *  Omit on surfaces with no public payload (editor preview, marketplace
   *  templates): the CTA zones are derived from `state`. */
  ctaHotzones?: CtaHotzone[];
  /** Fires the cta-click analytics on activation. Omit on editor previews. */
  analyticsProjectId?: string;
  /** Saved project whose engagement widgets become interactive. */
  projectId?: string | null;
}

export default function InteractionZonesOverlay({
  state,
  playback,
  ctaHotzones,
  analyticsProjectId,
  projectId,
}: InteractionZonesOverlayProps) {
  const zones = useInteractionZones(state);
  const cta = useMemo(() => resolveCtaHotzones(zones, ctaHotzones), [ctaHotzones, zones]);
  const engagement = useMemo(() => engagementZonesOf(zones), [zones]);
  return (
    <>
      {/* Pauses playback on click so the viewer isn't bounced mid-frame. */}
      <CtaHotzonesOverlay
        hotzones={cta}
        currentTimeSec={playback.playhead}
        onActivate={() => playback.pause()}
        analyticsProjectId={analyticsProjectId}
      />
      <EngagementZonesOverlay zones={engagement} projectId={projectId} playback={playback} />
    </>
  );
}
