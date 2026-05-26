/**
 * Inspector preview for the AI Presenter widget (#1557).
 *
 * Paints the chosen presenter into a small canvas and — when the user
 * clicks Play — runs the active TTS engine while swapping the mouth
 * viseme on every `onBoundary` callback. Same painter (`paintPresenter`)
 * is used at render time so the inspector preview matches the exported
 * MP4 pixel-for-pixel.
 *
 * Stop-on-unmount + cleanup-on-engine-change to avoid orphaned Web
 * Audio nodes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  estimateVisemesForText,
  getPresenter,
  type Viseme,
} from "@/lib/studio/avatar/presenters";
import { paintPresenter } from "@/lib/studio/avatar/paint";
import {
  speakWithEngine,
  type TtsEngineId,
} from "@/lib/services/tts-engines";

export interface AvatarPreviewProps {
  presenterId: string;
  script: string;
  engine: TtsEngineId;
  voiceId?: string;
  speed: number;
}

export default function AvatarPreview({
  presenterId,
  script,
  engine,
  voiceId,
  speed,
}: AvatarPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [viseme, setViseme] = useState<Viseme>("rest");
  const [error, setError] = useState<string | null>(null);

  const presenter = getPresenter(presenterId);

  // Paint whenever the viseme or presenter changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Soft brand-tinted background so the preview reads against the
    // editor's dark surface.
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paintPresenter(ctx, presenter, viseme, {
      x: 8,
      y: 8,
      w: canvas.width - 16,
      h: canvas.height - 16,
    });
  }, [presenter, viseme]);

  // Stop playback when this component unmounts OR when any input
  // changes mid-playback (engine / voice / script).
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, []);

  const play = useCallback(async () => {
    setError(null);
    if (!script.trim()) {
      setError("Type a script for the avatar first.");
      return;
    }
    cancelRef.current?.();
    setIsPlaying(true);
    const visemes = estimateVisemesForText(script);
    try {
      const cancel = await speakWithEngine(engine, {
        text: script,
        voiceId: voiceId ?? "",
        speed,
        onBoundary: (idx: number) => {
          setViseme(visemes[idx] ?? "rest");
        },
        onEnd: () => {
          setIsPlaying(false);
          setViseme("rest");
          cancelRef.current = null;
        },
        onError: (msg: string) => {
          setError(msg);
          setIsPlaying(false);
          setViseme("rest");
          cancelRef.current = null;
        },
      });
      cancelRef.current = cancel ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback failed");
      setIsPlaying(false);
    }
  }, [script, engine, voiceId, speed]);

  const stop = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setIsPlaying(false);
    setViseme("rest");
  }, []);

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <canvas
        ref={canvasRef}
        width={240}
        height={300}
        className="rounded-md border bg-white mx-auto block"
      />
      <div className="flex items-center justify-center gap-2">
        {isPlaying ? (
          <Button size="sm" variant="outline" onClick={stop}>
            <Pause className="h-4 w-4 mr-1.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={play}>
            <Play className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
