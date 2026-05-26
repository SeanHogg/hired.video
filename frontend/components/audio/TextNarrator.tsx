/**
 * TextNarrator — universal "listen to this text" player.
 *
 * Single reusable seam for every text-rich surface (lessons, articles,
 * blog posts, FAQs, job descriptions, company About blocks, resume
 * narratives). Visually presents as a small pill button in the host
 * page chrome; clicking expands the black audio-player bar (matching
 * PlaybackControls.tsx) inside a popover so the page stays compact and
 * the listen-to-this-text affordance is opt-in.
 *
 * Voice selection prefers anything the viewer has purchased or cloned
 * themselves (vibevoice engine, licensed-voices library). Falls back to
 * browser Web Speech voices when none are licensed, so anonymous and
 * Free-tier viewers still get a working player.
 *
 * Self-gates: returns null when speechSynthesis isn't available (private
 * Safari, embedded webviews) so no caller needs to compute canPlay.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Headphones,
  Loader2,
  Pause,
  Play,
  SkipBack,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import VolumeControl from "@/components/audio/VolumeControl";
import {
  estimateWordTimestamps,
  getBrowserVoices,
} from "@/lib/services/browser-tts";
import {
  setEngineVolume,
  speakWithEngine,
  stopEngine,
  type TtsEngineId,
} from "@/lib/services/tts-engines";
import {
  getLicensedVoices,
  type LicensedVoice,
  type TTSVoice,
} from "@/lib/services/studio-features-service";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  /** Optional preference key — when set, voice + rate persist in localStorage
   *  under this key so a learner's choice survives across lessons / pages. */
  preferenceKey?: string;
  /** Display mode. `pill` (default) = small toolbar-sized button that pops
   *  open the black player. `inline` = render the black player directly,
   *  for surfaces dedicated to consumption (course lesson body). */
  variant?: "pill" | "inline";
  /** Optional label override for the pill. Defaults to "Listen". */
  label?: string;
};

type NarratorVoice = {
  id: string;
  name: string;
  engine: TtsEngineId;
  group: "owner" | "purchased" | "browser";
};

const DEFAULT_RATE = 1;
const PREF_VERSION = "v2";

/** Strip Markdown / HTML to readable plain text. Web Speech reads raw
 *  markdown literally ("hash hash hash Title") — we want the body, not the
 *  markup. Light-weight string replaces; no AST. */
function plainTextFromMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadPref<T>(key: string | undefined, fallback: T): T {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${PREF_VERSION}:${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function savePref(key: string | undefined, value: unknown): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREF_VERSION}:${key}`, JSON.stringify(value));
  } catch {
    // localStorage can throw in private mode; preference is non-essential.
  }
}

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Pick the best default voice for a viewer. Owned clones come first
 *  (they paid the cost to create them), then purchased clones, then any
 *  licensed voice, then a browser fallback. Matches the principle from
 *  the project's voice marketplace: the viewer's own voice is the most
 *  personal default. */
function resolveDefaultVoiceId(voices: NarratorVoice[]): string | null {
  if (voices.length === 0) return null;
  const owned = voices.find((v) => v.group === "owner");
  if (owned) return owned.id;
  const purchased = voices.find((v) => v.group === "purchased");
  if (purchased) return purchased.id;
  return voices[0]!.id;
}

function mapLicensedToNarrator(v: LicensedVoice): NarratorVoice {
  return {
    id: v.id,
    name: v.isOwner ? `${v.name} (your voice)` : v.name,
    engine: "vibevoice",
    group: v.isOwner ? "owner" : "purchased",
  };
}

function mapBrowserToNarrator(v: TTSVoice): NarratorVoice {
  return {
    id: v.voice_id,
    name: v.name,
    engine: "web-speech",
    group: "browser",
  };
}

export function TextNarrator({
  text,
  className,
  preferenceKey,
  variant = "pill",
  label = "Listen",
}: Props) {
  // Self-gate: SSR + unsupported browsers render nothing.
  const supported =
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined";

  const { isAuthenticated } = useAuth();
  const [voices, setVoices] = useState<NarratorVoice[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(
    () =>
      loadPref<string | null>(
        preferenceKey ? `${preferenceKey}.voice` : undefined,
        null,
      ),
  );
  const [rate, setRate] = useState<number>(
    () =>
      loadPref<number>(
        preferenceKey ? `${preferenceKey}.rate` : undefined,
        DEFAULT_RATE,
      ),
  );
  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(
    () =>
      loadPref<number>(
        preferenceKey ? `${preferenceKey}.volume` : undefined,
        1,
      ),
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "playing" | "paused"
  >("idle");
  const [activeWordIdx, setActiveWordIdx] = useState<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const spoken = useMemo(() => plainTextFromMarkdown(text || ""), [text]);
  const words = useMemo(() => spoken.split(/\s+/).filter(Boolean), [spoken]);

  // Pre-estimate word timestamps once per text/rate so the scrubber can
  // translate playhead-word → seconds without re-walking the string per
  // tick. Used for the timecode and the seek scrubber's max value.
  const { timestamps, durationMs } = useMemo(
    () => estimateWordTimestamps(spoken, rate),
    [spoken, rate],
  );

  // Load all available voices. Owned/purchased come from the licensed
  // library (authed only — anonymous viewers skip the round trip).
  // Browser voices come from speechSynthesis and are always available.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const load = async () => {
      const browser = await getBrowserVoices().catch(() => [] as TTSVoice[]);
      const browserVoices: NarratorVoice[] = browser.map(mapBrowserToNarrator);

      let licensedVoices: NarratorVoice[] = [];
      if (isAuthenticated) {
        const licensed = await getLicensedVoices().catch(
          () => [] as LicensedVoice[],
        );
        licensedVoices = licensed.map(mapLicensedToNarrator);
      }

      if (cancelled) return;
      const all = [...licensedVoices, ...browserVoices];
      setVoices(all);
      // Seed default only when the user hasn't picked one (or their saved
      // pick is no longer available — e.g. they bought a voice and now
      // it's their owned default, but the saved pref still points at an
      // expired browser voice). Owned voices always win the seed.
      const savedStillValid = voiceId && all.some((v) => v.id === voiceId);
      if (!savedStillValid) {
        const seeded = resolveDefaultVoiceId(all);
        if (seeded) setVoiceId(seeded);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // voiceId intentionally omitted — initial seed only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, isAuthenticated]);

  // Stop any in-progress narration when the text changes or the
  // component unmounts.
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      stopEngine();
    };
  }, [text]);

  const currentVoice = useMemo(
    () => voices.find((v) => v.id === voiceId) ?? null,
    [voices, voiceId],
  );

  const startSpeaking = useCallback(
    (fromWordIdx: number) => {
      if (!supported || !spoken || !currentVoice) return;
      const fromIdx = Math.max(0, Math.min(fromWordIdx, words.length - 1));
      const remainder = words.slice(fromIdx).join(" ");
      if (!remainder) return;

      setStatus("loading");
      setActiveWordIdx(fromIdx);
      const effectiveVolume = muted ? 0 : volume;
      void speakWithEngine(currentVoice.engine, {
        text: remainder,
        voiceId: currentVoice.id,
        speed: rate,
        volume: effectiveVolume,
        onBoundary: (relativeIdx) => {
          setActiveWordIdx(fromIdx + relativeIdx);
          setStatus("playing");
        },
        onEnd: () => {
          setStatus("idle");
          setActiveWordIdx(null);
        },
        onError: () => {
          setStatus("idle");
          setActiveWordIdx(null);
        },
      })
        .then((cancel) => {
          cancelRef.current = cancel;
          setStatus("playing");
        })
        .catch(() => {
          setStatus("idle");
          setActiveWordIdx(null);
        });
    },
    [supported, spoken, currentVoice, rate, words, muted, volume],
  );

  const onPlay = useCallback(() => {
    startSpeaking(0);
  }, [startSpeaking]);

  const onPause = useCallback(() => {
    if (!supported) return;
    // Web Speech supports native pause/resume; WebGPU engines render the
    // full utterance to PCM so there's nothing to "pause" — stop and let
    // resume restart from the active word.
    if (currentVoice?.engine === "web-speech") {
      window.speechSynthesis.pause();
      setStatus("paused");
    } else {
      cancelRef.current?.();
      stopEngine();
      setStatus("paused");
    }
  }, [supported, currentVoice]);

  const onResume = useCallback(() => {
    if (!supported) return;
    if (currentVoice?.engine === "web-speech") {
      window.speechSynthesis.resume();
      setStatus("playing");
    } else {
      startSpeaking(activeWordIdx ?? 0);
    }
  }, [supported, currentVoice, activeWordIdx, startSpeaking]);

  const onStop = useCallback(() => {
    cancelRef.current?.();
    stopEngine();
    setStatus("idle");
    setActiveWordIdx(null);
  }, []);

  const onSeek = useCallback(
    (nextSec: number) => {
      const targetMs = nextSec * 1000;
      let idx = 0;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i].start <= targetMs) idx = i;
        else break;
      }
      cancelRef.current?.();
      stopEngine();
      if (status === "playing" || status === "loading") {
        startSpeaking(idx);
      } else {
        setActiveWordIdx(idx);
        setStatus("paused");
      }
    },
    [timestamps, status, startSpeaking],
  );

  const onToggleMute = useCallback(() => {
    if (!supported) return;
    setMuted((m) => {
      const next = !m;
      // Live-apply to any in-flight WebGPU playback so the mute
      // toggle is instant. Web Speech ignores live volume changes,
      // so a mid-utterance unmute on the browser engine waits for
      // the next utterance — acceptable given Web Speech's API limits.
      setEngineVolume(next ? 0 : volume);
      return next;
    });
  }, [supported, volume]);

  const onChangeVolume = useCallback(
    (next: number) => {
      setVolume(next);
      savePref(preferenceKey ? `${preferenceKey}.volume` : undefined, next);
      // Unmute the moment the user drags the volume up — matches the
      // YouTube / system-volume convention.
      if (next > 0 && muted) setMuted(false);
      setEngineVolume(muted && next === 0 ? 0 : next);
    },
    [preferenceKey, muted],
  );

  const onChangeVoice = useCallback(
    (id: string) => {
      setVoiceId(id);
      savePref(preferenceKey ? `${preferenceKey}.voice` : undefined, id);
      if (status === "playing" || status === "paused") onStop();
    },
    [preferenceKey, status, onStop],
  );

  const onChangeRate = useCallback(
    (next: number[]) => {
      const r = next[0] ?? DEFAULT_RATE;
      setRate(r);
      savePref(preferenceKey ? `${preferenceKey}.rate` : undefined, r);
      if (status === "playing" || status === "paused") onStop();
    },
    [preferenceKey, status, onStop],
  );

  if (!supported) return null;
  if (!spoken) return null;

  const durationSec = durationMs / 1000;
  const playheadSec =
    activeWordIdx != null && timestamps[activeWordIdx]
      ? timestamps[activeWordIdx]!.start / 1000
      : 0;
  const grouped = {
    owner: voices.filter((v) => v.group === "owner"),
    purchased: voices.filter((v) => v.group === "purchased"),
    browser: voices.filter((v) => v.group === "browser"),
  };
  const isPlaying = status === "playing";
  const isLoading = status === "loading";
  const playPauseHandler = isPlaying
    ? onPause
    : status === "paused"
      ? onResume
      : onPlay;

  // The black audio bar — same chrome as PlaybackControls.tsx. Used as
  // the inline mode and as the popover body in pill mode.
  const blackBar = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl bg-black/90 px-3 py-2 text-white backdrop-blur-sm",
      )}
      role="region"
      aria-label="Listen to this content"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSeek(0)}
        aria-label="Back to start"
        disabled={!currentVoice}
        className="h-8 w-8 shrink-0 rounded-full p-0 text-white hover:bg-white/10 disabled:opacity-40"
      >
        <SkipBack className="h-4 w-4" />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={playPauseHandler}
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!currentVoice || isLoading}
        className="h-9 w-9 shrink-0 rounded-full p-0"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <input
        type="range"
        min={0}
        max={Math.max(0.1, durationSec)}
        step={0.1}
        value={Math.min(playheadSec, durationSec)}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-brand-purple"
        aria-label="Playhead"
      />

      <span className="shrink-0 text-[11px] tabular-nums opacity-80">
        {formatTime(playheadSec)} / {formatTime(durationSec)}
      </span>

      <VolumeControl
        volume={volume}
        onVolumeChange={onChangeVolume}
        muted={muted}
        onToggleMute={onToggleMute}
        tone="dark"
      />
    </div>
  );

  const settingsPane = (
    <div className="space-y-3 px-1 pb-1 pt-2">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Voice
        </label>
        <Select value={voiceId ?? undefined} onValueChange={onChangeVoice}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Pick a voice" />
          </SelectTrigger>
          <SelectContent>
            {grouped.owner.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs">Your voices</SelectLabel>
                {grouped.owner.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {grouped.purchased.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs">
                  Purchased &amp; licensed
                </SelectLabel>
                {grouped.purchased.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {grouped.browser.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs">Browser voices</SelectLabel>
                {grouped.browser.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">
            Speed
          </label>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {rate.toFixed(2)}×
          </span>
        </div>
        <Slider
          value={[rate]}
          min={0.7}
          max={1.8}
          step={0.05}
          onValueChange={onChangeRate}
          aria-label="Narration speed"
        />
      </div>
    </div>
  );

  if (variant === "inline") {
    // Bar above the body, with the voice/speed picker sitting under it.
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {blackBar}
        <details className="text-xs text-muted-foreground self-end">
          <summary className="cursor-pointer select-none px-1">
            Voice &amp; speed
          </summary>
          <div className="w-72 rounded-md border bg-popover p-2 shadow-md">
            {settingsPane}
          </div>
        </details>
      </div>
    );
  }

  // Pill: a small toolbar-sized button that opens the player in a
  // popover. Optional by definition — nothing plays until the viewer
  // clicks the pill. While playing, the pill shows a pulse + Pause icon
  // so the host page surfaces the play state without expanding.
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={isPlaying ? "Open audio player (playing)" : label}
          className={cn(
            "h-7 px-2 gap-1.5 text-xs",
            isPlaying && "border-brand-purple text-brand-purple",
            className,
          )}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Headphones className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-2">
        {blackBar}
        {settingsPane}
      </PopoverContent>
    </Popover>
  );
}

export default TextNarrator;
