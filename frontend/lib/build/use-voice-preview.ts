/**
 * useVoicePreview — the voice picker's ▶: hear a narration voice before
 * picking it. The sample is rendered in the browser by the same engine that
 * narrates the video (renderNarrationSample) and played straight away;
 * nothing is uploaded. One sample plays at a time; pressing the playing
 * voice again stops it. Rendered samples are kept for the page's life, so a
 * second listen is instant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { renderNarrationSample } from "@/lib/studio/page-narration";

/** Object URLs by voice + text (the audio itself, never re-rendered). */
const samples = new Map<string, Promise<string>>();

function sampleUrl(voiceId: string, text: string): Promise<string> {
  const key = `${voiceId}\u0000${text}`;
  const hit = samples.get(key);
  if (hit) return hit;
  const next = renderNarrationSample(voiceId, text).then((blob) => URL.createObjectURL(blob));
  samples.set(key, next);
  // A failure is not kept: the next press may try again.
  next.catch(() => samples.delete(key));
  return next;
}

export type PreviewState = "idle" | "loading" | "playing";

export function useVoicePreview(text: string) {
  const [active, setActive] = useState<{ voiceId: string; state: Exclude<PreviewState, "idle"> } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  // Bumped on every press / stop, so a sample that lands late never plays.
  const turn = useRef(0);

  const stop = useCallback(() => {
    turn.current += 1;
    audio.current?.pause();
    audio.current = null;
    setActive(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    async (voiceId: string) => {
      const pressedSame = active?.voiceId === voiceId;
      stop();
      if (pressedSame) return;
      const mine = turn.current;
      setActive({ voiceId, state: "loading" });
      try {
        const url = await sampleUrl(voiceId, text);
        if (turn.current !== mine) return;
        const el = new Audio(url);
        el.onended = () => {
          if (audio.current === el) stop();
        };
        audio.current = el;
        setActive({ voiceId, state: "playing" });
        await el.play();
      } catch {
        if (turn.current === mine) stop();
      }
    },
    [active, stop, text],
  );

  const stateOf = (voiceId: string): PreviewState => (active?.voiceId === voiceId ? active.state : "idle");
  return { toggle, stateOf };
}
