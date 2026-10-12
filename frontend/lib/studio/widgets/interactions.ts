/**
 * Interaction zones (#2312) — every clickable rectangle a viewer can use
 * while a project plays, derived from the Timeline through the widget
 * registry: ONE `timedEffectZones` walk keeps the effects whose plugin
 * declares `interactions`, then asks that plugin what the widget does.
 * There is no list of interactive effect kinds here — a new interactive
 * widget kind only declares `interactions` on its plugin.
 *
 * The playback overlay (components/video/InteractionZonesOverlay) projects
 * these onto its controls: CTA anchors (`ctaHotzonesOf`) and engagement
 * widgets (`engagementZonesOf`, lib/studio/engagement/engagement-zones).
 * Pure (no React, no fetch).
 */
import { timedEffectZones, type CtaHotzone } from "@shared/cta-hotzones";
import type { Timeline } from "@shared/timeline";
import type { WidgetInteraction } from "./plugin";
import { pluginForEffectKind } from "./registry";

export interface InteractionZone<I extends WidgetInteraction = WidgetInteraction> {
  startSec: number;
  endSec: number;
  /** Fractional box (0..1 of the frame). */
  x: number;
  y: number;
  w: number;
  h: number;
  interaction: I;
}

const isInteractiveEffect = (effectKind: string): boolean => pluginForEffectKind(effectKind)?.interactive ?? false;

/** Every interaction on the Timeline, in paint order. Empty for a missing /
 *  malformed timeline or one with no interactive widget. */
export function extractInteractionZones(timeline: Timeline | null | undefined): InteractionZone[] {
  const out: InteractionZone[] = [];
  for (const { effectKind, params, ...box } of timedEffectZones(timeline, isInteractiveEffect)) {
    const plugin = pluginForEffectKind(effectKind);
    if (!plugin) continue;
    for (const interaction of plugin.interactions(params)) out.push({ ...box, interaction });
  }
  return out;
}

/** The zones of one interaction kind, narrowed. */
export function zonesOfKind<K extends WidgetInteraction["kind"]>(
  zones: ReadonlyArray<InteractionZone>,
  kind: K,
): InteractionZone<Extract<WidgetInteraction, { kind: K }>>[] {
  return zones.filter((z): z is InteractionZone<Extract<WidgetInteraction, { kind: K }>> => z.interaction.kind === kind);
}

/** CTA zones in the public payload's hot-zone shape (`CtaHotzone`) — what
 *  `CtaHotzonesOverlay` renders and the API bakes campaign UTMs into. */
export function ctaHotzonesOf(zones: ReadonlyArray<InteractionZone>): CtaHotzone[] {
  return zonesOfKind(zones, "cta").map(({ interaction, ...box }) => ({ ...box, url: interaction.url }));
}

/** The CTA hot-zones a player overlays. The public payload's list
 *  (`/api/studio/public/:id` — same Timeline, same `ctaUrlFromParams`
 *  rule, plus the campaign UTMs only the API knows) wins when supplied;
 *  otherwise the zones are the client-derived CTA interactions. */
export function resolveCtaHotzones(
  zones: ReadonlyArray<InteractionZone>,
  publicHotzones: CtaHotzone[] | undefined,
): CtaHotzone[] {
  return publicHotzones ?? ctaHotzonesOf(zones);
}
