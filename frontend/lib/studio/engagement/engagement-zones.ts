/**
 * Engagement zones — where and when each bound engagement-asset widget
 * (form, chapter marker, thumbnail stamp, review pin) sits on the played
 * video, read from the same Timeline the export paints (#1586).
 *
 * The playback overlay (components/video/EngagementZonesOverlay) turns
 * these into interactive controls over ANY player: the DOM stage, the
 * frame-painted fullscreen preview, or a baked MP4. They are the
 * `engagement` interactions the engagement-asset plugin declares, read off
 * the one registry-driven Timeline walk (lib/studio/widgets/interactions)
 * that also yields the CTA hot-zones (#2312). Pure (no React, no fetch).
 */
import type { Timeline } from "@shared/timeline";
import type { EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";
import { extractInteractionZones, zonesOfKind, type InteractionZone } from "@/lib/studio/widgets/interactions";

export interface EngagementZone {
  /** Stable per zone (kind, asset and start), for React keys. */
  key: string;
  kind: EngagementAssetKind;
  assetId: string;
  startSec: number;
  endSec: number;
  /** Fractional box (0..1 of the frame). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The engagement zones among already-derived interaction zones. Only a
 *  BOUND widget of a known kind declares an interaction (the plugin's
 *  `boundEngagementAsset` rule), so unbound cards never appear. */
export function engagementZonesOf(zones: ReadonlyArray<InteractionZone>): EngagementZone[] {
  return zonesOfKind(zones, "engagement").map(({ interaction: { assetKind: kind, assetId }, ...box }) => ({
    ...box,
    kind,
    assetId,
    key: `${kind}:${assetId}:${box.startSec}`,
  }));
}

/** Every BOUND engagement widget on the Timeline. */
export function extractEngagementZones(timeline: Timeline | null | undefined): EngagementZone[] {
  return engagementZonesOf(extractInteractionZones(timeline));
}

/** Zones visible at `timeSec` (start inclusive, end exclusive — the same
 *  window rule as CTA hot-zones). */
export function activeEngagementZones(zones: EngagementZone[], timeSec: number): EngagementZone[] {
  return zones.filter((z) => timeSec >= z.startSec && timeSec < z.endSec);
}

/**
 * The form zone that must stop playback right now: a visible form whose
 * form is `requireToContinue` and that this viewer hasn't submitted yet.
 * `isRequired` answers from the loaded form rows (a form still loading or
 * missing never gates — playback must not stall on a fetch).
 */
export function gatingFormZone(
  zones: EngagementZone[],
  timeSec: number,
  isRequired: (formId: string) => boolean,
  submitted: ReadonlySet<string>,
): EngagementZone | null {
  for (const zone of activeEngagementZones(zones, timeSec)) {
    if (zone.kind !== "video-form") continue;
    if (submitted.has(zone.assetId)) continue;
    if (isRequired(zone.assetId)) return zone;
  }
  return null;
}
