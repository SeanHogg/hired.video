/**
 * CTA hot-zone extraction — turn the saved Timeline JSON into a list of
 * `{ time-range, fractional bbox, destination URL }` rectangles that
 * the public player overlays as clickable anchors on top of the baked
 * MP4. Single source of truth so the API DTO and any client-side
 * interactive previews compute identical zones from the same input.
 *
 * The Timeline can hold many widget kinds — only CTA-link effects
 * (`CTA_LINK_EFFECT_KINDS`: the CTA card and the linked-content card) with
 * a non-empty `ctaUrl` produce hot-zones. Everything else is ignored.
 *
 * The API imports this module, so it stays registry-free. The frontend
 * derives EVERY clickable zone (CTA, engagement, …) from the widget
 * plugins' `interactions` declarations over the same `timedEffectZones`
 * walk (frontend/lib/studio/widgets/interactions.ts); the CTA plugin's
 * declaration reads its URL through `ctaUrlFromParams` below, so the API
 * payload and the client agree on which CTAs are clickable (#2312).
 */

import type { Timeline } from "./timeline.js";

export interface CtaHotzone {
  /** First second (inclusive) the hot-zone is visible / clickable. */
  startSec: number;
  /** Last second (exclusive) the hot-zone is visible / clickable. */
  endSec: number;
  /** Fractional left edge (0..1 of the player's rendered width). */
  x: number;
  /** Fractional top edge (0..1 of the player's rendered height). */
  y: number;
  /** Fractional width (0..1 of the player's rendered width). */
  w: number;
  /** Fractional height (0..1 of the player's rendered height). */
  h: number;
  /** Destination URL. The renderer opens this in a new tab. */
  url: string;
}

/** A timed, fractional rectangle of one widget effect on the Timeline —
 *  the geometry every playback overlay (CTA anchors, engagement widgets)
 *  needs, plus the effect's own params for the caller to interpret. */
export interface TimedEffectZone {
  /** The clip effect's kind, e.g. `canvas-v2:cta`. */
  effectKind: string;
  startSec: number;
  endSec: number;
  x: number;
  y: number;
  w: number;
  h: number;
  params: Record<string, unknown>;
}

/** The clip effect kind a CTA widget emits. */
export const CTA_EFFECT_KIND = "canvas-v2:cta";

/** The clip effect kind a linked-content card emits. Its `ctaUrl` is the
 *  linked entity's public page, written at emit time (#2312). */
export const LINKED_CONTENT_EFFECT_KIND = "canvas-v2:linked-content";

/** Effect kinds whose `ctaUrl` param is a viewer-facing link: the player
 *  overlays a hot-zone for each, campaigns bake their UTMs into each, and
 *  an export paints its readable link + QR. */
export const CTA_LINK_EFFECT_KINDS: ReadonlySet<string> = new Set([CTA_EFFECT_KIND, LINKED_CONTENT_EFFECT_KIND]);

const isCtaLinkEffect = (kind: string): boolean => CTA_LINK_EFFECT_KINDS.has(kind);

/** Which effects a walk keeps: one kind, or a predicate over the kind. */
export type EffectKindFilter = string | ((effectKind: string) => boolean);

/** Every clip effect matching `filter` on the Timeline's video tracks, with
 *  its time window and fractional box. The ONE walk shared by
 *  `extractCtaHotzones` (API) and the plugin-driven interaction zones
 *  (frontend). Empty for a missing / malformed timeline. */
export function timedEffectZones(
  timeline: Timeline | null | undefined,
  filter: EffectKindFilter,
): TimedEffectZone[] {
  const keep = typeof filter === "string" ? (kind: string) => kind === filter : filter;
  if (!timeline || !Array.isArray(timeline.tracks)) return [];
  const fps = typeof timeline.fps === "number" && timeline.fps > 0 ? timeline.fps : 30;
  const out: TimedEffectZone[] = [];
  for (const track of timeline.tracks) {
    if (track.kind !== "video") continue;
    for (const clip of track.clips ?? []) {
      const startFrame = Number(clip.startFrame) || 0;
      const durFrames = Number(clip.durationFrames) || 0;
      if (durFrames <= 0) continue;
      for (const effect of clip.effects ?? []) {
        if (typeof effect.kind !== "string" || !keep(effect.kind)) continue;
        const params = (effect.params ?? {}) as Record<string, unknown>;
        out.push({
          effectKind: effect.kind,
          startSec: startFrame / fps,
          endSec: (startFrame + durFrames) / fps,
          x: numberOr(params.x, 0),
          y: numberOr(params.y, 0),
          w: numberOr(params.width, 1),
          h: numberOr(params.height, 0.2),
          params,
        });
      }
    }
  }
  return out;
}

/** The destination a CTA effect's params link to — the trimmed `ctaUrl`,
 *  or null when it has none (an unlinked CTA is not clickable). */
export function ctaUrlFromParams(params: Record<string, unknown>): string | null {
  const url = typeof params.ctaUrl === "string" ? params.ctaUrl.trim() : "";
  return url || null;
}

/** Pull every CTA hot-zone out of a Timeline. Returns an empty array
 *  when the timeline is missing / malformed / has no CTA widgets,
 *  so callers can spread the result into props unconditionally. */
export function extractCtaHotzones(
  timeline: Timeline | null | undefined,
): CtaHotzone[] {
  const out: CtaHotzone[] = [];
  for (const { params, startSec, endSec, x, y, w, h } of timedEffectZones(timeline, isCtaLinkEffect)) {
    const url = ctaUrlFromParams(params);
    if (url) out.push({ startSec, endSec, x, y, w, h, url });
  }
  return out;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
