/**
 * Offline audio mixer for the Timeline render path.
 *
 * Renders all audio tracks down to a single stereo AudioBuffer using an
 * OfflineAudioContext. The result is what the WebCodecs strategy hands
 * to AudioEncoder; the ffmpeg.wasm strategy can use the same PCM via
 * filter_complex if it ever wants to bypass ffmpeg's own demux of the
 * source files.
 *
 * Per the standing DRY rule, this is the ONE place that knows how to
 * translate Timeline audio clips into a PCM mix. No render strategy
 * does its own scheduling.
 *
 * M1 scope:
 *   - Mixes only `kind === 'audio'` tracks. Audio embedded in video
 *     clips (via the source's own audio stream) is NOT mixed in this
 *     pass. Most hired.video timelines pair voiceover/music as an
 *     audio track; full A/V audio mixing lands in M2.
 *   - Per-track gain + mute + per-clip gain. Pan is read but applied
 *     as a stereo balance via channel-merger; non-stereo source files
 *     are upmixed by the Web Audio graph automatically.
 *   - Solo support: when ANY track has solo=true, only solo'd tracks
 *     contribute. Single source of truth for "is this track audible?"
 *     lives in `isTrackAudible()` below.
 */

import {
  framesToSeconds,
  timelineDurationFrames,
  type MediaSource,
  type Timeline,
  type Track,
} from "@shared/timeline";
import { connectAudioEffectChain, processAudioBuffer } from "./effects";
import { resolveClipSource, type NestedTimelineResolver } from "./frame-renderer";

/** Maximum nesting depth before the mixer bails. Same guard as the
 *  frame renderer — protects against cycles in user-authored projects. */
const MAX_NEST_DEPTH = 8;

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

/** Decide whether a track contributes to the final mix given solo state. */
export function isTrackAudible(track: Track, anySolo: boolean): boolean {
  if (track.muted) return false;
  if (anySolo && !track.solo) return false;
  return true;
}

export interface RenderAudioOptions {
  /** Resolver for nested-timeline (compound) clips. When omitted, nested
   *  clips render silent — same fallback the visual side uses. */
  resolveNestedTimeline?: NestedTimelineResolver;
}

/**
 * Render every audio track in the timeline down to a single stereo
 * 48 kHz AudioBuffer. Returns null when there are no audible audio
 * clips (the strategy then skips audio encoding entirely).
 *
 * Nested-timeline clips (#356): when `resolveNestedTimeline` is wired,
 * the mixer recursively mixes each child timeline down to a buffer and
 * overlays it at the parent clip's startFrame. Recursion is depth-bounded
 * (MAX_NEST_DEPTH) and cycle-guarded so a project that points a nested
 * clip back at itself fails soft instead of spinning forever.
 */
export async function renderTimelineAudio(
  timeline: Timeline,
  sources: Record<string, MediaSource>,
  options: RenderAudioOptions = {},
  _depth = 0,
  _inFlight: Set<string> = new Set(),
): Promise<AudioBuffer | null> {
  const totalFrames = timelineDurationFrames(timeline);
  if (totalFrames <= 0) return null;
  const totalSeconds = framesToSeconds(totalFrames, timeline.fps);

  const anySolo = timeline.tracks.some((t) => t.kind === "audio" && t.solo);
  const audioTracks = timeline.tracks.filter(
    (t) => t.kind === "audio" && isTrackAudible(t, anySolo),
  );
  const hasContent = audioTracks.some((t) => t.clips.length > 0);
  if (!hasContent) return null;

  // Pre-decode every distinct audio source the active tracks reference.
  // Web Audio's decodeAudioData wants the bytes, so fetch each source
  // URL once. Cache so re-uses across clips share one buffer.
  const decodeCache = new Map<string, AudioBuffer>();
  // OfflineAudioContext doubles as the decoder host — its decodeAudioData
  // uses the same sampleRate normalization the schedule will play at.
  const ctx = new OfflineAudioContext({
    numberOfChannels: CHANNELS,
    length: Math.ceil(totalSeconds * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
  });

  // Multicam clips fan out to every angle's source so a mid-render
  // angle switch doesn't surprise us with a missing decode.
  const allSourceIds = new Set<string>();
  for (const t of audioTracks) {
    for (const c of t.clips) {
      if (c.nestedTimelineId) continue;
      if (c.multicamGroupId) {
        const group = timeline.multicamGroups?.find((g) => g.id === c.multicamGroupId);
        if (group) for (const a of group.angles) allSourceIds.add(a.sourceId);
      } else {
        allSourceIds.add(c.sourceId);
      }
    }
  }
  await Promise.all(
    Array.from(allSourceIds).map(async (sourceId) => {
      const src = sources[sourceId];
      if (!src) return;
      try {
        const res = await fetch(src.url);
        const buf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        decodeCache.set(sourceId, decoded);
      } catch {
        // Skip the source — render proceeds with silence for that clip.
      }
    }),
  );

  // Schedule every clip on every audible track. Each clip becomes a
  // BufferSourceNode → GainNode (clip + track gain product) → per-track
  // effect chain → destination. Buffer-stage track effects (e.g. the
  // noise gate) pre-process the decoded buffer ONCE per track per
  // distinct source — cached so multiple clips referencing the same
  // source don't re-run the gate. We don't apply pan in M1 (the
  // underlying Web Audio upmix handles channels for us).
  for (const track of audioTracks) {
    const trackBufferCache = new Map<string, AudioBuffer>();
    const getProcessedBuffer = (sourceId: string): AudioBuffer | undefined => {
      const cached = trackBufferCache.get(sourceId);
      if (cached) return cached;
      const decoded = decodeCache.get(sourceId);
      if (!decoded) return undefined;
      const processed = processAudioBuffer(track.effects, decoded, ctx);
      trackBufferCache.set(sourceId, processed);
      return processed;
    };

    for (const clip of track.clips) {
      // Nested-timeline clips recurse into their child timeline (#356).
      // We pre-resolve them after this loop so we can await the async
      // child render without blocking the synchronous scheduling pass.
      // Hand off to scheduleNestedClip() below.
      if (clip.nestedTimelineId) continue;
      // Resolve via the shared helper so multicam clips pick the
      // active angle's source + sync offset.
      const resolved = resolveClipSource(clip, timeline);
      const decoded = getProcessedBuffer(resolved.sourceId);
      if (!decoded) continue;
      const node = ctx.createBufferSource();
      node.buffer = decoded;

      const gainNode = ctx.createGain();
      const trackGain = track.gain ?? 1;
      const clipGain = clip.gain ?? 1;
      gainNode.gain.value = Math.max(0, trackGain * clipGain);

      node.connect(gainNode);
      const trackOutput = connectAudioEffectChain(track.effects, gainNode, ctx);
      trackOutput.connect(ctx.destination);

      const startSec = framesToSeconds(clip.startFrame, timeline.fps);
      const sourceInSec = framesToSeconds(
        clip.sourceInFrame + resolved.syncOffsetFrames,
        timeline.fps,
      );
      const durationSec = framesToSeconds(clip.durationFrames, timeline.fps);
      try {
        node.start(startSec, sourceInSec, durationSec);
      } catch {
        // start() throws if values are out-of-range; skip silently.
      }
    }
  }

  // ── Nested-timeline mix-down (#356) ─────────────────────────────────
  // Recursively mix each nested clip's child timeline and overlay the
  // resulting buffer onto the parent context at the clip's startFrame.
  // Cycle-guard via _inFlight; depth-guard via _depth.
  if (options.resolveNestedTimeline && _depth < MAX_NEST_DEPTH) {
    for (const track of audioTracks) {
      const trackGain = track.gain ?? 1;
      for (const clip of track.clips) {
        if (!clip.nestedTimelineId) continue;
        if (_inFlight.has(clip.nestedTimelineId)) {
          console.warn(
            `[audio-mixer] cycle detected on nested timeline ${clip.nestedTimelineId}; skipping`,
          );
          continue;
        }
        const resolved = await options.resolveNestedTimeline(clip.nestedTimelineId);
        if (!resolved) continue;
        const nextInFlight = new Set(_inFlight);
        nextInFlight.add(clip.nestedTimelineId);
        const childBuffer = await renderTimelineAudio(
          resolved.timeline,
          resolved.sources,
          options,
          _depth + 1,
          nextInFlight,
        );
        if (!childBuffer) continue;
        // Insert the child buffer as a single decoded source at the
        // parent clip's startFrame. The buffer is already at the parent's
        // sampleRate because OfflineAudioContext resamples on decode;
        // re-decoding through the parent ctx would be redundant.
        const node = ctx.createBufferSource();
        node.buffer = childBuffer;
        const gainNode = ctx.createGain();
        const clipGain = clip.gain ?? 1;
        gainNode.gain.value = Math.max(0, trackGain * clipGain);
        node.connect(gainNode);
        const trackOutput = connectAudioEffectChain(track.effects, gainNode, ctx);
        trackOutput.connect(ctx.destination);
        const startSec = framesToSeconds(clip.startFrame, timeline.fps);
        const sourceInSec = framesToSeconds(clip.sourceInFrame, timeline.fps);
        const durationSec = framesToSeconds(clip.durationFrames, timeline.fps);
        try {
          node.start(startSec, sourceInSec, durationSec);
        } catch {
          // Out-of-range — child clip extends past the parent's duration
          // or the source-in offset is past the buffer's length. Skip
          // silently rather than aborting the whole mix.
        }
      }
    }
  }

  return ctx.startRendering();
}

/** Convert an AudioBuffer to a flat interleaved Float32Array. Used by
 *  the AudioEncoder feed loop in webcodecs-render. */
export function audioBufferToInterleaved(buf: AudioBuffer): Float32Array {
  const channels = buf.numberOfChannels;
  const length = buf.length;
  const out = new Float32Array(length * channels);
  for (let ch = 0; ch < channels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      out[i * channels + ch] = data[i];
    }
  }
  return out;
}
