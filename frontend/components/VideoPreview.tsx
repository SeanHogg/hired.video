// VideoPreview.tsx — canvas RAF loop calling frameRenderer.render().
// When an audio track is provided it is played/paused in sync with the video.
// When voiceover is enabled, the configured TTS engine (Web Speech / Kokoro
// / Piper / VibeVoice) speaks each scene's text at the right time.

import { useEffect, useRef, useCallback } from "react";
import { render } from "@/lib/renderer/frame-renderer";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { VideoAudio, VoiceoverConfig, SceneElement, ElementBox } from "@/types/video-script";
import { getAmbientPlayer } from "@/lib/audio/ambient-player";
import { speakWithEngine, stopEngine, type TtsEngineId } from "@/lib/services/tts-engines";
import CanvasElementOverlay from "@/components/studio/CanvasElementOverlay";

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
}

export default function VideoPreview({
  compiledVideo, playing, currentTime, onTimeUpdate, className, audio, voiceover, sceneTimings,
  overlayElements, selectedElementId, onSelectElement, onUpdateElementBox,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const timeRef     = useRef(currentTime);
  const lastTsRef   = useRef<number | null>(null);
  const audioActiveRef = useRef<string | null>(null);

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

  // ── Ambient audio: start/stop in sync with playing ────────────────────
  useEffect(() => {
    const player = getAmbientPlayer();
    const trackKey = audio?.track;
    const volume   = audio?.volume ?? 0.6;

    if (playing && trackKey && trackKey !== "none") {
      if (audioActiveRef.current !== trackKey) {
        player.play(trackKey, volume);
        audioActiveRef.current = trackKey;
      }
    } else {
      if (player.playing) {
        player.stop();
        audioActiveRef.current = null;
      }
    }
  }, [playing, audio?.track, audio?.volume]);

  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      getAmbientPlayer().stop();
      stopEngine();
      if (voCancelRef.current) { voCancelRef.current(); voCancelRef.current = null; }
    };
  }, []);

  // ── Live volume changes ───────────────────────────────────────────────
  useEffect(() => {
    if (audio?.volume !== undefined && getAmbientPlayer().playing) {
      getAmbientPlayer().setVolume(audio.volume);
    }
  }, [audio?.volume]);

  // ── Canvas RAF loop ───────────────────────────────────────────────────
  const drawFrame = useCallback((ts: number) => {
    if (!compiledVideo || !canvasRef.current) return;

    if (playing) {
      const delta = lastTsRef.current !== null ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;
      timeRef.current += delta;

      if (timeRef.current >= compiledVideo.totalDuration) {
        timeRef.current = 0; // loop
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
  }, [compiledVideo, playing, onTimeUpdate]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // Size canvas to match CompiledVideo dimensions
  const width  = compiledVideo?.width  ?? 1280;
  const height = compiledVideo?.height ?? 720;

  // Show the drag overlay only when the user has elements + edit handlers wired
  const hasOverlay = !!(overlayElements && overlayElements.length > 0 && onSelectElement && onUpdateElementBox);

  if (!hasOverlay) {
    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className ?? "w-full rounded-lg bg-black"}
      />
    );
  }

  return (
    <div className={`relative ${className ?? "w-full rounded-lg bg-black"}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full block"
      />
      <CanvasElementOverlay
        elements={overlayElements!}
        selectedId={selectedElementId ?? null}
        onSelect={onSelectElement!}
        onUpdateBox={onUpdateElementBox!}
      />
    </div>
  );
}
