/**
 * TextNarrator — universal "listen to this text" player.
 *
 * Single reusable seam for every text-rich surface (lessons, articles,
 * blog posts, FAQs, job descriptions, company About blocks, resume
 * narratives). Themed to match the black player chrome the rest of the
 * app uses — see PlaybackControls.tsx — so the audio bar reads as the
 * same playback control no matter what surface mounts it.
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
  Settings2,
  SkipBack,
  Volume2,
  VolumeX,
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
import {
  estimateWordTimestamps,
  getBrowserVoices,
} from "@/lib/services/browser-tts";
import {
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
  /** Compact mode collapses to just play / scrub / time and tucks the voice
   *  + speed pickers into a popover. Default false (full bar). */
  compact?: boolean;
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
    group: v.isOwner
      ? "owner"
      : v.licenseSource === "purchase"
        ? "purchased"
        : "purchased",
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
  compact = false,
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
      const browser = await getBrowserVoices().catch(
        () => [] as TTSVoice[],
      );
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
      const savedStillValid =
        voiceId && all.some((v) => v.id === voiceId);
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
  // component unmounts. Prevents the previous utterance from continuing
  // into a different lesson / page.
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
      // Build the substring from fromWordIdx so seek-mid-playback resumes
      // at the chosen word rather than replaying from zero.
      const fromIdx = Math.max(0, Math.min(fromWordIdx, words.length - 1));
      const remainder = words.slice(fromIdx).join(" ");
      if (!remainder) return;

      setStatus("loading");
      setActiveWordIdx(fromIdx);
      void speakWithEngine(currentVoice.engine, {
        text: remainder,
        voiceId: currentVoice.id,
        speed: rate,
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
    [supported, spoken, currentVoice, rate, words],
  );

  const onPlay = useCallback(() => {
    startSpeaking(0);
  }, [startSpeaking]);

  const onPause = useCallback(() => {
    if (!supported) return;
    // Web Speech supports native pause/resume; WebGPU engines render the
    // full utterance to PCM and play through Web Audio, which has no
    // pause primitive — stop instead so the UI matches reality.
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
      // WebGPU engines: restart from the word we paused on.
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
      // Map seconds → word index via the pre-estimated timestamps.
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
    // Web Speech utterance volume can't be changed after .speak() so the
    // simplest cross-engine mute is "stop the audio while muted." A real
    // gain-node mute would mean owning the AudioContext here; not worth
    // the rewrite for what is fundamentally an audio-out toggle.
    setMuted((m) => {
      const next = !m;
      if (next && (status === "playing" || status === "loading")) onStop();
      return next;
    });
  }, [supported, status, onStop]);

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

  // Group voices for the picker.
  const grouped = {
    owner: voices.filter((v) => v.group === "owner"),
    purchased: voices.filter((v) => v.group === "purchased"),
    browser: voices.filter((v) => v.group === "browser"),
  };

  const settingsPanel = (
    <div className="space-y-4 p-1">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Voice
        </label>
        <Select value={voiceId ?? undefined} onValueChange={onChangeVoice}>
          <SelectTrigger className="h-9 w-full text-xs">
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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Speed
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">
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

  const isPlaying = status === "playing";
  const isLoading = status === "loading";

  const playPauseHandler = isPlaying
    ? onPause
    : status === "paused"
      ? onResume
      : onPlay;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-black/80 px-4 py-3 text-white backdrop-blur-sm",
        className,
      )}
      role="region"
      aria-label="Listen to this content"
    >
      <Headphones
        className="h-4 w-4 shrink-0 opacity-70 hidden sm:block"
        aria-hidden
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSeek(0)}
        aria-label="Back to start"
        disabled={!currentVoice}
        className="h-10 w-10 shrink-0 rounded-full p-0 text-white hover:bg-white/10 disabled:opacity-40"
      >
        <SkipBack className="h-4 w-4" />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={playPauseHandler}
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!currentVoice || isLoading}
        className="h-12 w-12 shrink-0 rounded-full p-0"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
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

      <span className="shrink-0 min-w-[7rem] text-center text-xs tabular-nums opacity-80">
        {formatTime(playheadSec)} / {formatTime(durationSec)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        className="h-10 w-10 shrink-0 rounded-full p-0 text-white hover:bg-white/10"
      >
        {muted ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>

      {compact ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Narration settings"
              className="h-10 w-10 shrink-0 rounded-full p-0 text-white hover:bg-white/10"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            {settingsPanel}
          </PopoverContent>
        </Popover>
      ) : (
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <Select value={voiceId ?? undefined} onValueChange={onChangeVoice}>
            <SelectTrigger className="h-9 w-[200px] border-white/20 bg-white/5 text-xs text-white">
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Narration speed"
                className="h-10 w-14 shrink-0 rounded-full p-0 text-xs text-white hover:bg-white/10 tabular-nums"
              >
                {rate.toFixed(2)}×
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Speed
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
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
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

export default TextNarrator;
