/**
 * Audio-layer ⇄ Timeline projection (split out of timeline-emit.ts, #2312).
 *
 *   • `emitAudioRenderClips` — the a1/a2 RENDER clips the export mixes
 *   • `resolveTimelineAudioSources` — sourceId → playable MediaSource map
 *   • `recoverAudioLayersFromClips` — the legacy read fallback when a saved
 *     Timeline has no `audioLayers` snapshot
 *
 * The lossless editor projection (the `audioLayers` snapshot on the first
 * background effect) stays with the scene emit in timeline-emit.ts.
 */
import { type AudioLayer, buildAudioLayers, type CanvasState, makeAudioLayer } from "./canvas-state";
import { buildCanvasAudioSegments } from "./canvas-state-to-clips";
import { audioLayerSelectionId, findMusicTrack, resolvePlayableLayerSrc } from "../music-catalog";
import type { Clip, MediaSource, Timeline, Track } from "@shared/timeline";

/**
 * Audio layers → render clips. Music + sfx layers lay on A1, voiceover
 * layers on A2; both tracks allow overlap so MANY layers can sound at
 * once (the multi-track audio rebuild). The timing, gain (layer × lane ×
 * master), ducking and fades come from `buildCanvasAudioSegments` — the
 * SAME lane builder the live preview plays (#476 / #742), so the mix a
 * user hears in the editor is the mix the export renders. The full layer
 * set is ALSO stashed on the first background effect so the editor
 * round-trip is lossless; these clips are the render projection.
 */
export function emitAudioRenderClips(state: CanvasState, totalSec: number, a1: Track, a2: Track): void {
  const fps = state.fps;
  for (const seg of buildCanvasAudioSegments(state, totalSec)) {
    const { layer } = seg;
    const clip: Clip = {
      id: seg.segmentCount === 1 ? `audio_${layer.id}` : `audio_${layer.id}_${seg.segmentIndex}`,
      sourceId: audioLayerSourceId(layer),
      startFrame: Math.round(seg.startSec * fps),
      durationFrames: Math.max(1, Math.round((seg.endSec - seg.startSec) * fps)),
      // Seek into the source at the layer's trim (+ the duck segment's
      // elapsed offset) so music continues uninterrupted under a duck.
      sourceInFrame: Math.round(seg.sourceInSec * fps),
      gain: seg.gain,
      ...(seg.fadeInSec > 0 ? { fadeInFrames: Math.round(seg.fadeInSec * fps) } : {}),
      ...(seg.fadeOutSec > 0 ? { fadeOutFrames: Math.round(seg.fadeOutSec * fps) } : {}),
    };
    (seg.lane === "music" ? a1 : a2).clips.push(clip);
  }
}

/** The render-side `sourceId` of an audio layer: the raw url for a custom
 *  layer, `music:<selectionId>` for stock music. Shared by the clip emit
 *  and the source map so the two can't disagree. */
function audioLayerSourceId(layer: AudioLayer): string {
  return layer.source.kind === "custom"
    ? layer.source.url
    : `music:${audioLayerSelectionId(layer.source)}`;
}

/**
 * Build the `Record<sourceId, MediaSource>` map the Timeline renderer's
 * audio mixer needs. The Timeline JSON itself only carries opaque
 * `sourceId` strings on audio clips (`music:<selectionId>` for the
 * music lane and the raw voiceover URL for the voiceover lane) —
 * resolving each id to a playable URL is this helper's job. Async
 * because stock-music selections may need procedural rendering on
 * first use. Single source of truth so every render entry point
 * (export, publish, future server worker) constructs the same map.
 */
export async function resolveTimelineAudioSources(
  state: CanvasState,
): Promise<Record<string, MediaSource>> {
  const sources: Record<string, MediaSource> = {};
  const fps = state.fps;
  const uploadedAt = new Date(0).toISOString();
  const layers = buildAudioLayers(state as Parameters<typeof buildAudioLayers>[0]);

  for (const layer of layers) {
    const sourceId = audioLayerSourceId(layer);
    if (!sourceId || sources[sourceId]) continue;
    const url = await resolvePlayableLayerSrc(layer.source);
    if (!url) continue;
    sources[sourceId] = {
      id: sourceId,
      kind: "audio",
      url,
      proxyUrl: null,
      // Stock music has no fixed frame length (it fits the comp); custom
      // layers carry their source duration.
      durationFrames:
        layer.source.kind === "custom"
          ? Math.max(1, Math.round(layer.durationSeconds * fps))
          : 0,
      fps,
      width: null,
      height: null,
      filename: layer.label || layer.kind,
      uploadedAt,
    };
  }

  return sources;
}

/** Reconstruct audio layers from a timeline's a1/a2 render clips — the
 *  fallback when no `audioLayers` snapshot is present (timelines authored
 *  before the multi-track rebuild). a1 carries music (sourceId
 *  `music:<id>`) + sfx (raw url); a2 carries voiceover (raw url, with an
 *  optional `canvas-v2:voiceover-meta` sidecar from legacy emits). Stock
 *  music re-resolves by id; custom-music URLs aren't carried by render
 *  clips (gap-registered). */
export function recoverAudioLayersFromClips(timeline: Timeline, fps: number): AudioLayer[] {
  const out: AudioLayer[] = [];
  const a1 = timeline.tracks.find((t) => t.id === "a1");
  const seenMusic = new Set<string>();
  const seenSfx = new Set<string>();
  for (const c of a1?.clips ?? []) {
    if (c.sourceId.startsWith("music:")) {
      const sel = c.sourceId.slice("music:".length);
      if (seenMusic.has(sel)) continue;
      seenMusic.add(sel);
      if (sel.startsWith("custom:")) {
        // Custom music — the selection id carries the playable url
        // (`custom:<url>`), so a pre-snapshot legacy timeline still
        // recovers the layer's source instead of dropping it.
        const url = sel.slice("custom:".length);
        if (!url) continue;
        out.push(
          makeAudioLayer({
            kind: "music",
            source: { kind: "custom", url },
            label: "Music",
            durationSeconds: c.durationFrames / fps,
          }),
        );
      } else {
        out.push(
          makeAudioLayer({
            kind: "music",
            source: { kind: "stock", trackId: sel },
            label: findMusicTrack(sel)?.label ?? "Music",
            durationSeconds: findMusicTrack(sel)?.durationSeconds ?? 0,
          }),
        );
      }
    } else if (c.sourceId && !seenSfx.has(c.sourceId)) {
      seenSfx.add(c.sourceId);
      out.push(
        makeAudioLayer({
          kind: "sfx",
          source: { kind: "custom", url: c.sourceId },
          label: "SFX",
          durationSeconds: c.durationFrames / fps,
        }),
      );
    }
  }
  const a2 = timeline.tracks.find((t) => t.id === "a2");
  for (const c of a2?.clips ?? []) {
    if (!c.sourceId) continue;
    const meta = (c.effects?.find((e) => e.kind === "canvas-v2:voiceover-meta")?.params ?? {});
    out.push(
      makeAudioLayer({
        kind: "voiceover",
        source: { kind: "custom", url: c.sourceId },
        label: typeof meta.label === "string" ? meta.label : "Voiceover",
        durationSeconds: c.durationFrames / fps,
        anchorSceneId: typeof meta.anchorSceneId === "string" ? meta.anchorSceneId : null,
        gain: typeof meta.gain === "number" ? meta.gain : c.gain ?? 1,
        muted: meta.muted === true,
        ...(typeof meta.text === "string" && meta.text ? { text: meta.text } : {}),
      }),
    );
  }
  return out;
}
