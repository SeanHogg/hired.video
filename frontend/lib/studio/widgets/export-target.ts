/**
 * The export render target (#2312). A downloaded or posted file has no
 * playback overlay, so an interactive widget's action (a CTA link) would
 * be a dead box. `withExportTarget` stamps `renderTarget: "export"` on a
 * render copy of the Timeline; each clip's `RenderContext` reads it back
 * (`renderContextFromParams`) and the plugin draws its own fallback. The
 * stamp is data on the clip, like the project font, so nothing threads a
 * flag through the render strategies.
 *
 * The saved Timeline is never stamped (absent = interactive), so baked
 * freshness hashes and the public payload are unaffected.
 */
import type { Timeline } from "@shared/timeline";
import { loadQrEncoder } from "./qr-encoder";
import { RENDER_TARGET_PARAM, pluginForEffectKind } from "./registry";

/** A copy of `timeline` whose widget clips render for export. */
export function stampExportTarget(timeline: Timeline): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.effects?.some((e) => pluginForEffectKind(e.kind))
          ? {
              ...clip,
              effects: clip.effects.map((effect) =>
                pluginForEffectKind(effect.kind)
                  ? { ...effect, params: { ...effect.params, [RENDER_TARGET_PARAM]: "export" } }
                  : effect,
              ),
            }
          : clip,
      ),
    })),
  };
}

/** True when the Timeline is an export render copy (some widget clip
 *  carries the stamp). Nested renders inherit it (frame-renderer). */
export function isExportTimeline(timeline: Timeline): boolean {
  return timeline.tracks.some((track) =>
    track.clips.some((clip) => (clip.effects ?? []).some((effect) => effect.params?.[RENDER_TARGET_PARAM] === "export")),
  );
}

/** True when some widget on the Timeline draws a QR code on export. */
export function timelineNeedsQr(timeline: Timeline): boolean {
  return timeline.tracks.some((track) =>
    track.clips.some((clip) =>
      (clip.effects ?? []).some((effect) => {
        const plugin = pluginForEffectKind(effect.kind);
        return !!plugin?.assets(plugin.parse(effect.params)).qrCodes?.length;
      }),
    ),
  );
}

/** The Timeline an export renders: stamped for the export target, with the
 *  QR encoder loaded when a widget needs it (the painters are synchronous).
 *  Call AFTER every URL rewrite (campaign UTMs) so the QR carries them. */
export async function withExportTarget(timeline: Timeline): Promise<Timeline> {
  const stamped = stampExportTarget(timeline);
  if (timelineNeedsQr(stamped)) await loadQrEncoder();
  return stamped;
}
