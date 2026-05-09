// VideoPreview.tsx — canvas RAF loop calling frameRenderer.render().
// When an audio track is provided it is played/paused in sync with the video.
// When voiceover is enabled, the configured TTS engine (Web Speech / Kokoro
// / Piper / VibeVoice) speaks each scene's text at the right time.

import { useEffect, useRef, useCallback } from "react";
import { render } from "@/lib/renderer/frame-renderer";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { VideoAudio, VoiceoverConfig, SceneElement, ElementBox } from "@/types/video-script";
import { scheduleClipsToDestination, type ClipScheduleHandle } from "@/lib/audio/clip-scheduler";
import { normalizeAudioClips } from "@/lib/audio/normalize-clips";
import { speakWithEngine, stopEngine, type TtsEngineId } from "@/lib/services/tts-engines";
import CanvasElementOverlay from "@/components/studio/CanvasElementOverlay";
import EndCapOverlay from "@/components/studio/EndCapOverlay";

interface SceneTiming {
  id: string;
  start: number;
  duration: number;
  /** Text to speak for this scene (pre-built from scene fields) */
  text?: string;
}

interface Props {
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  className?: string;
  audio?: VideoAudio;
  voiceover?: VoiceoverConfig | null;
  sceneTimings?: SceneTiming[];
  /** Free-form elements for the currently visible scene (for the drag overlay). */
  overlayElements?: SceneElement[];
  /** Currently selected element id (for the drag overlay). */
  selectedElementId?: string | null;
  /** Called when the user clicks an element on the canvas (or empty space → null). */
  onSelectElement?: (id: string | null) => void;
  /** Called as the user drags or resizes an element. */
  onUpdateElementBox?: (id: string, box: ElementBox) => void;
  /** Fired when the playhead reaches the end of the compiled timeline.
   *  Parent typically handles this by setting `playing` to false so the
   *  player pauses on the last frame and the EndCapOverlay can show. */
  onEnded?: () => void;
  /** When true (and the video has reached its natural end), the
   *  EndCapOverlay covers the canvas with a hired.video branded card.
   *  Caller computes via `shouldShowBranding({ isPro, removeBrandingFlag })`. */
  showBrandingEndCap?: boolean;
}

export default function VideoPreview({
  compiledVideo, playing, currentTime, onTimeUpdate, className, audio, voiceover, sceneTimings,
  overlayElements, selectedElementId, onSelectElement, onUpdateElementBox,
  onEnded, showBrandingEndCap = false,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const timeRef     = useRef(currentTime);
  const lastTsRef   = useRef<number | null>(null);
  // Live music playback — owns the AudioContext and the schedule
  // returned by scheduleClipsToDestination. Stopped + rebuilt on
  // play/pause + seek + clip-list changes.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioHandleRef = useRef<ClipScheduleHandle | null>(null);
  // Snapshot of the clip list we last scheduled, so unrelated playhead
  // ticks don't tear down + re-decode music every frame.
  const audioClipsKeyRef = useRef<string>("");
  const audioStartedAtRef = useRef<number>(0);

  // ── Voiceover: browser TTS synced to scene timing ──────────────────────
  const voActiveRef = useRef<string | null>(null);
  const voCancelRef = useRef<(() => void) | null>(null);

  // Sync voiceover speech with current time and playing state
  useEffect(() => {
    if (!sceneTimings || !voiceover?.enabled || !playing) {
      // Stop any active speech when paused or voiceover disabled
      if (voCancelRef.current) {
        voCancelRef.current();
        voCancelRef.current = null;
      }
      voActiveRef.current = null;
      return;
    }

    // Find which scene we're in
    const t = timeRef.current;
    let activeSceneId: string | null = null;
    for (const timing of sceneTimings) {
      if (t >= timing.start && t < timing.start + timing.duration) {
        activeSceneId = timing.id;
        break;
      }
    }

    // If we moved to a new scene, start speaking its text
    if (activeSceneId && activeSceneId !== voActiveRef.current) {
      // Stop previous speech
      if (voCancelRef.current) {
        voCancelRef.current();
        voCancelRef.current = null;
      }

      const timing = sceneTimings.find((s) => s.id === activeSceneId);
      const text = timing?.text;
      if (text) {
        const engine = (voiceover.engine as TtsEngineId | undefined) ?? "web-speech";
        // speakWithEngine is async (WebGPU engines load lazily). We don't
        // await it inside the effect — instead, we capture the cancel as
        // soon as it resolves. If the user has already moved off this
        // scene by then, the cancel still works.
        speakWithEngine(engine, {
          text,
          voiceId: voiceover.voiceId !== "browser-default" ? voiceover.voiceId : "",
          speed: voiceover.speed ?? 1,
          onEnd: () => { voCancelRef.current = null; },
          onError: () => { voCancelRef.current = null; },
        }).then((cancel) => {
          voCancelRef.current = cancel;
        }).catch(() => {
          voCancelRef.current = null;
        });
      }
      voActiveRef.current = activeSceneId;
    } else if (!activeSceneId && voActiveRef.current) {
      // Between scenes or past end
      if (voCancelRef.current) {
        voCancelRef.current();
        voCancelRef.current = null;
      }
      voActiveRef.current = null;
    }
  });

  // Keep timeRef in sync with currentTime prop (for scrubbing)
  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  // ── Music playback: schedule all clips on play, tear down on pause ────
  // The scheduler is the single playback path for both preset clips
  // (procedural AmbientPlayer) and rendered URL clips (decoded buffer
  // sources) — VideoPreview just hands it the clip list + the current
  // playhead so clips line up to scene timings.
  const totalDuration = compiledVideo?.totalDuration ?? 0;
  const clips = normalizeAudioClips(audio, totalDuration);
  // Stable key for the clip list so we don't tear down + re-fetch URL
  // clips on every playhead tick. Volume / mute changes go through the
  // master GainNode (separate effect).
  const clipsKey = clips.map((c) => `${c.id}|${c.track}|${c.startSec}|${c.endSec}|${c.volume ?? 1}`).join(";");
  const masterVolume = audio?.volume ?? 0.6;
  // Allow seeks of up to this many seconds without rebuilding the
  // schedule — buffer sources are already running, the playhead RAF
  // just catches up. Larger jumps tear down + rebuild from the new
  // playhead so we resync.
  const SEEK_TOLERANCE_SEC = 0.5;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!playing || clips.length === 0) return;
      const ctx = new AudioContext();
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* user gesture is what unblocks */ }
      }
      const master = ctx.createGain();
      master.gain.value = masterVolume;
      master.connect(ctx.destination);
      const handle = await scheduleClipsToDestination(clips, ctx, master, timeRef.current);
      if (cancelled) {
        handle.stop();
        master.disconnect();
        ctx.close().catch(() => {});
        return;
      }
      audioCtxRef.current = ctx;
      audioMasterRef.current = master;
      audioHandleRef.current = handle;
      audioClipsKeyRef.current = clipsKey;
      audioStartedAtRef.current = timeRef.current;
    }

    function stopAll() {
      audioHandleRef.current?.stop();
      audioHandleRef.current = null;
      audioMasterRef.current?.disconnect();
      audioMasterRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      audioClipsKeyRef.current = "";
    }

    if (!playing) {
      stopAll();
      return;
    }
    // Already running with the same clip list — leave it alone.
    if (audioCtxRef.current && audioClipsKeyRef.current === clipsKey) return;
    stopAll();
    void start();

    return () => {
      cancelled = true;
    };
  }, [playing, clipsKey, masterVolume]);
  // ^^ masterVolume in deps so a 0→non-zero kick restarts; the live
  // volume-change effect below handles small in-flight tweaks without
  // rebuilding the schedule.

  // Live master-volume tweaks while playing — apply to the running
  // GainNode so the slider is responsive.
  useEffect(() => {
    const master = audioMasterRef.current;
    const ctx = audioCtxRef.current;
    if (master && ctx) {
      master.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
    }
  }, [masterVolume]);

  // Resync on big seeks — small drifts are tolerated so the buffer
  // sources keep rolling.
  useEffect(() => {
    if (!playing) return;
    if (!audioCtxRef.current) return;
    const drift = Math.abs(currentTime - (audioStartedAtRef.current + (audioCtxRef.current.currentTime)));
    if (drift > SEEK_TOLERANCE_SEC) {
      // Force the play effect to rebuild from the new playhead by
      // clearing the cached key — next render will tear down + restart.
      audioClipsKeyRef.current = "";
      audioHandleRef.current?.stop();
      audioHandleRef.current = null;
      audioMasterRef.current?.disconnect();
      audioMasterRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [currentTime, playing]);

  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      audioHandleRef.current?.stop();
      audioHandleRef.current = null;
      audioMasterRef.current?.disconnect();
      audioMasterRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      stopEngine();
      if (voCancelRef.current) { voCancelRef.current(); voCancelRef.current = null; }
    };
  }, []);

  // ── Canvas RAF loop ───────────────────────────────────────────────────
  const endedFiredRef = useRef(false);
  const drawFrame = useCallback((ts: number) => {
    if (!compiledVideo || !canvasRef.current) return;

    if (playing) {
      // If the user pressed play after the video ended, restart from 0 and
      // arm the ended-fired guard for the next end. The guard prevents
      // onEnded from firing twice on the same playthrough.
      if (timeRef.current >= compiledVideo.totalDuration) {
        timeRef.current = 0;
        endedFiredRef.current = false;
      }
      const delta = lastTsRef.current !== null ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;
      timeRef.current += delta;

      if (timeRef.current >= compiledVideo.totalDuration) {
        // Pause on the last frame instead of looping. The parent owns the
        // `playing` flag so we hand control back via onEnded; the overlay
        // then has time to mount over the still last frame.
        timeRef.current = compiledVideo.totalDuration;
        if (!endedFiredRef.current) {
          endedFiredRef.current = true;
          onEnded?.();
        }
      }
      onTimeUpdate(timeRef.current);
    } else {
      lastTsRef.current = null;
    }

    const ctx = canvasRef.current.getContext("2d");
    // previewMode tells the renderer to suppress the watermark inside the
    // first scene — the in-app scrubber lands on t=0 a lot (e.g. clicking
    // the first storyboard card) and we don't want the watermark to be
    // the dominant element of the user's own first impression. The final
    // export path doesn't pass this flag, so deliverables are unchanged.
    if (ctx) render(ctx, compiledVideo, timeRef.current, { previewMode: true });

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [compiledVideo, playing, onTimeUpdate, onEnded]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // Size canvas to match CompiledVideo dimensions
  const width  = compiledVideo?.width  ?? 1280;
  const height = compiledVideo?.height ?? 720;

  // Show the drag overlay only when the user has elements + edit handlers wired
  const hasOverlay = !!(overlayElements && overlayElements.length > 0 && onSelectElement && onUpdateElementBox);

  // Replay handler — rewind and let the parent flip `playing` back on. We
  // can't toggle parent state here, so we just seek to 0 and clear the
  // ended-fired guard; the parent's onPlayPause is the user's next click.
  const handleReplay = useCallback(() => {
    timeRef.current = 0;
    endedFiredRef.current = false;
    onTimeUpdate(0);
  }, [onTimeUpdate]);

  // The video has reached its natural end when playback is paused at (or
  // past) totalDuration. We compare against the live timeRef so the
  // overlay appears even when the parent's currentTime hasn't ticked yet.
  const atEnd = !!compiledVideo
    && !playing
    && currentTime >= compiledVideo.totalDuration - 0.05;

  return (
    <div className={`relative ${className ?? "w-full rounded-lg bg-black"}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={hasOverlay ? "w-full h-full block" : "w-full h-full block"}
      />
      {hasOverlay && (
        <CanvasElementOverlay
          elements={overlayElements!}
          selectedId={selectedElementId ?? null}
          onSelect={onSelectElement!}
          onUpdateBox={onUpdateElementBox!}
        />
      )}
      <EndCapOverlay
        atEnd={atEnd}
        showBranding={showBrandingEndCap}
        onReplay={handleReplay}
      />
    </div>
  );
}
