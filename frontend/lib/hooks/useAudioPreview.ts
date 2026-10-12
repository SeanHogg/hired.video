/**
 * useAudioPreview — shared play/pause state for inline audio previews.
 *
 * The voice marketplace card, the public voice detail page, and the studio
 * music picker all need the same surface: a button per item that toggles
 * inline playback of a single shared HTMLAudioElement (at most one preview
 * playing across the page at a time).
 *
 * Why a hook instead of three near-identical local `useRef + useState`
 * blocks: the old copies set `playing = true` synchronously before
 * `audio.play()` resolved. On iOS / mobile Safari, `play()` rejects
 * silently for cross-origin codec mismatches or for any audio that loses
 * the user-gesture context — the button flips to "Pause" for one frame
 * and silently flips back, which is the failure mode reported as
 * "voice player doesn't work on mobile".
 *
 * Mobile-safe behaviour this hook guarantees:
 *   - `play()` is awaited; state only flips after the Promise settles.
 *   - Native `play` / `pause` / `ended` events are the source of truth
 *     for `isPlaying` — backgrounding the tab or hitting the system
 *     media controls keeps the UI in sync.
 *   - Real load/play errors surface as a toast instead of vanishing.
 *   - One Audio element is reused per hook instance; switching tracks
 *     swaps `src` rather than spawning detached elements (iOS caps the
 *     number of simultaneous media elements).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface UseAudioPreviewResult {
  /** Toggle playback for the given key + URL. Plays if not active, pauses if active. */
  toggle: (key: string, url: string | null | undefined) => Promise<void>;
  /** True iff the audio for `key` is currently playing. */
  isActive: (key: string) => boolean;
  /** Imperatively stop any playback (e.g. before navigating away). */
  stop: () => void;
}

export function useAudioPreview(): UseAudioPreviewResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.addEventListener("ended", () => setIsPlaying(false));
    audio.addEventListener("error", () => {
      setIsPlaying(false);
      toast.error("Couldn't load preview.");
    });
    audioRef.current = audio;
    return audio;
  }, []);

  const toggle = useCallback(
    async (key: string, url: string | null | undefined): Promise<void> => {
      if (!url) {
        toast.message("This preview isn't available yet.");
        return;
      }

      const audio = ensureAudio();

      if (activeKey === key && isPlaying) {
        audio.pause();
        return;
      }

      if (activeKey !== key) {
        audio.pause();
        audio.src = url;
        audio.load();
        setActiveKey(key);
      }

      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
        toast.error("Couldn't play preview. Tap again to retry.");
      }
    },
    [activeKey, isPlaying, ensureAudio],
  );

  const isActive = useCallback(
    (key: string) => activeKey === key && isPlaying,
    [activeKey, isPlaying],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  return { toggle, isActive, stop };
}
