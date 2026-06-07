/**
 * useMusicScheduler — the single shared "play these audio clips" hook.
 *
 * Every studio play surface (V1 VideoPreview live, V2 usePreviewPlayback,
 * V2 PreviewOverlay via the same hook, /v/:id via VideoPreview) routes
 * through this — per the DRY rule there is exactly ONE scheduler call site
 * in the editor codebase. The live device-backed AudioContext itself comes
 * from the shared `acquireSharedAudioContext()` owner (live-audio-context.ts),
 * which all interactive audio surfaces share so idle device handles can't
 * linger and re-emit the WebAudio device error. Add a new play surface? Just
 * call this hook with the right clip list.
 *
 * Music clips, voiceover clips, scene audio — anything with a
 * `{track, startSec, endSec, volume}` shape rides on the same lane.
 * The hook doesn't know or care which is which; the caller is responsible
 * for converting their domain model (v2 `state.musicSource +
 * state.voiceovers`, v1 `audio.clips + voiceover.scenes`) into the flat
 * AudioClip[] this hook consumes.
 *
 * Lifecycle:
 *   playing=true + non-empty clips ⇒ open AudioContext, schedule via the
 *     shared `scheduleClipsToDestination`, hold the handle for teardown.
 *   playing=false OR empty clips    ⇒ stop the schedule, close the ctx.
 *
 * Master volume is applied through a long-lived GainNode so a slider
 * tweak doesn't tear the schedule down + re-decode buffers — the
 * scheduler runs untouched while the gain ramps in place.
 *
 * The `clipsKey` is debounced 150ms so drag-resizing a clip on the
 * timeline (which mutates startSec every mousemove tick) doesn't rebuild
 * the AudioContext on every frame (#477). The committed schedule only
 * advances after the drag settles.
 */
import { useEffect, useRef, useState } from "react";
import type { AudioClip } from "@/types/video-script";
import { scheduleClipsToDestination, type ClipScheduleHandle } from "@/lib/audio/clip-scheduler";
import { acquireSharedAudioContext } from "@/lib/audio/live-audio-context";

export interface UseMusicSchedulerInput {
  /** True while the play surface is actively playing. False pauses /
   *  tears down the schedule. */
  playing: boolean;
  /** Flat clip list. The hook is agnostic to what each clip represents —
   *  callers fold music + voiceover + scene-audio into this array
   *  themselves. */
  clips: AudioClip[];
  /** Master output gain 0..1. Live tweaks are applied without rebuilding
   *  the schedule. */
  masterVolume: number;
  /** Live playhead reference — the scheduler reads it ONCE at start time
   *  to compute offsets into each clip. Subsequent seeks rebuild the
   *  schedule (the new playhead is read on the next play). Using a ref
   *  (not a value) lets the consumer's RAF loop write into it without
   *  re-rendering this hook every frame. */
  playheadRef: { current: number };
}

export function useMusicScheduler({
  playing,
  clips,
  masterVolume,
  playheadRef,
}: UseMusicSchedulerInput): void {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioReleaseRef = useRef<(() => void) | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioHandleRef = useRef<ClipScheduleHandle | null>(null);
  const audioClipsKeyRef = useRef<string>("");

  // Stable key for the clip list so we don't tear down + re-decode
  // music on every render. Master-volume / mute changes flow through
  // the running GainNode in the separate live-volume effect below —
  // they do NOT rebuild the schedule.
  const clipsKey = clips
    .map((c) => `${c.id}|${c.track}|${c.startSec}|${c.endSec}|${c.volume ?? 1}`)
    .join(";");

  // Debounce key updates by 150ms so a clip drag (mutates startSec
  // every mousemove tick) doesn't tear down + re-decode the
  // AudioContext on every frame — #477. The committed key only
  // advances once the user pauses; the schedule then rebuilds from
  // the final positions.
  const [debouncedClipsKey, setDebouncedClipsKey] = useState(clipsKey);
  useEffect(() => {
    if (debouncedClipsKey === clipsKey) return;
    const t = window.setTimeout(() => setDebouncedClipsKey(clipsKey), 150);
    return () => window.clearTimeout(t);
  }, [clipsKey, debouncedClipsKey]);

  // Main scheduler effect.
  useEffect(() => {
    let cancelled = false;

    function stopAll() {
      audioHandleRef.current?.stop();
      audioHandleRef.current = null;
      audioMasterRef.current?.disconnect();
      audioMasterRef.current = null;
      // Release our hold on the shared context rather than closing it
      // directly — the shared owner reclaims the device once every consumer
      // has released (see live-audio-context.ts).
      audioReleaseRef.current?.();
      audioReleaseRef.current = null;
      audioCtxRef.current = null;
      audioClipsKeyRef.current = "";
    }

    if (!playing || clips.length === 0) {
      stopAll();
      return;
    }
    // Already running with the same clip list — keep playing.
    if (audioCtxRef.current && audioClipsKeyRef.current === debouncedClipsKey) return;
    stopAll();

    (async () => {
      try {
        const { ctx, release } = acquireSharedAudioContext();
        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch (e) {
            // Autoplay policy can block resume until a user gesture;
            // log + carry on rather than throwing. The next user gesture
            // re-trips this effect via `playing` flipping false→true.
            console.warn(
              "[useMusicScheduler] AudioContext resume failed — music may be silent until next user gesture",
              e,
            );
          }
        }
        const master = ctx.createGain();
        // Read masterVolume at start time. Live tweaks are applied via
        // the live-volume effect, NOT by rebuilding.
        master.gain.value = masterVolume;
        master.connect(ctx.destination);
        const handle = await scheduleClipsToDestination(
          clips,
          ctx,
          master,
          playheadRef.current,
        );
        if (cancelled) {
          handle.stop();
          master.disconnect();
          release();
          return;
        }
        audioCtxRef.current = ctx;
        audioReleaseRef.current = release;
        audioMasterRef.current = master;
        audioHandleRef.current = handle;
        audioClipsKeyRef.current = debouncedClipsKey;
      } catch (e) {
        console.error("[useMusicScheduler] failed to start music playback", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // masterVolume intentionally NOT in deps — the live-volume effect
    // handles updates without rebuilding the schedule. clips intentionally
    // NOT in deps — its identity changes every render even when content is
    // stable; debouncedClipsKey IS the change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, debouncedClipsKey]);

  // Live master-volume tweaks while playing — apply to the running
  // GainNode so the slider is responsive without rebuilding.
  useEffect(() => {
    const master = audioMasterRef.current;
    const ctx = audioCtxRef.current;
    if (master && ctx) {
      master.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
    }
  }, [masterVolume]);

  // Stop audio on unmount.
  useEffect(() => {
    return () => {
      audioHandleRef.current?.stop();
      audioHandleRef.current = null;
      audioMasterRef.current?.disconnect();
      audioMasterRef.current = null;
      audioReleaseRef.current?.();
      audioReleaseRef.current = null;
      audioCtxRef.current = null;
    };
  }, []);
}
