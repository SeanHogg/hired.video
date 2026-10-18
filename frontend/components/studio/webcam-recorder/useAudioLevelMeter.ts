import { useCallback, useRef, useState } from "react";
import { acquireSharedAudioContext } from "@/lib/audio/live-audio-context";

/**
 * Live microphone level (0–1) for the recorder's meter. Taps the shared
 * live AudioContext with an analyser that never connects to the
 * destination, so it is silent. No unmount effect of its own — the
 * recorder's single unmount cleanup calls `stopAudioAnalysis` in its
 * fixed teardown order.
 */
export function useAudioLevelMeter() {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCtxReleaseRef = useRef<(() => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);

  const stopAudioAnalysis = useCallback(() => {
    if (audioAnimFrameRef.current !== null) {
      cancelAnimationFrame(audioAnimFrameRef.current);
      audioAnimFrameRef.current = null;
    }
    if (audioContextRef.current) {
      // Release our hold on the shared live context (the analyser tap never
      // connects to the destination, so this is silent) rather than closing
      // it directly.
      audioCtxReleaseRef.current?.();
      audioCtxReleaseRef.current = null;
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const startAudioAnalysis = useCallback(
    (stream: MediaStream) => {
      stopAudioAnalysis();

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      try {
        const { ctx, release } = acquireSharedAudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = ctx;
        audioCtxReleaseRef.current = release;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(avg / 128, 1)); // normalise 0-1
          audioAnimFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // AudioContext may not be available in all environments
      }
    },
    [stopAudioAnalysis],
  );

  return { audioLevel, startAudioAnalysis, stopAudioAnalysis };
}
