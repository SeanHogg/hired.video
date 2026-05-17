// VideoPreview.tsx — canvas RAF loop calling frameRenderer.render().
// Music + voiceover-clip playback is delegated to the shared
// `useMusicScheduler` hook so V1 preview, V2 preview, and the /v/:id
// live player all schedule audio through the SAME `scheduleClipsToDestination`
// seam (per the DRY rule). TTS voiceover (`speakWithEngine`) stays in
// this component because the V1 voiceover model is a TTS spec, not a
// pre-rendered audio clip — V2's pre-rendered VoiceoverClip[] rides on
// the music-clip lane via canvas-state-to-clips.ts.

import { useEffect, useRef, useCallback } from "react";
import { render } from "@/lib/renderer/frame-renderer";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { VideoAudio, VoiceoverConfig, SceneElement, ElementBox } from "@/types/video-script";
import { normalizeAudioClips } from "@/lib/audio/normalize-clips";
import { useMusicScheduler } from "@/lib/audio/use-music-scheduler";
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

  // ── Music + voiceover-clip playback ────────────────────────────────
  // Delegated to the shared `useMusicScheduler` so V1 + V2 preview +
  // /v/:id watch surface all schedule audio through the same seam.
  // Per DRY: this component no longer owns AudioContext lifecycle.
  const totalDuration = compiledVideo?.totalDuration ?? 0;
  const clips = normalizeAudioClips(audio, totalDuration);
  const masterVolume = audio?.volume ?? 0.6;
  useMusicScheduler({
    playing,
    clips,
    masterVolume,
    playheadRef: timeRef,
  });

  // Stop TTS voiceover engine on unmount (the shared scheduler tears
  // down its own AudioContext separately).
  useEffect(() => {
    return () => {
      stopEngine();
      if (voCancelRef.current) {
        voCancelRef.current();
        voCancelRef.current = null;
      }
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
