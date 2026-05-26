/**
 * TextNarrator — universal "listen to this text" player.
 *
 * Designed as a single reusable seam for any text-rich surface:
 * course lessons (#1519), article reader (#1508), certificate
 * verify pages, profile bios — anywhere a learner / reader might
 * prefer audio.
 *
 * Wraps `browser-tts.ts` (Web Speech API; 100% client-side, zero
 * infra). Self-gates: returns null when `speechSynthesis` isn't
 * available (private-mode Safari, some embedded webviews) so no
 * caller has to compute `canPlay` before mounting per DRY rule.
 *
 * Markdown is stripped to plain text before speaking — Web Speech
 * reads literal asterisks and pound signs aloud otherwise.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Loader2, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getBrowserVoices,
  speak,
  stopSpeaking,
} from "@/lib/services/browser-tts";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  /** Optional preference key — when set, voice + rate persist in localStorage
   *  under this key so a learner's choice survives across lessons / pages. */
  preferenceKey?: string;
};

type VoiceOption = { id: string; name: string; lang: string };

const RATE_OPTIONS = [
  { value: 0.85, label: "0.85×" },
  { value: 1, label: "1×" },
  { value: 1.15, label: "1.15×" },
  { value: 1.35, label: "1.35×" },
  { value: 1.6, label: "1.6×" },
];

const DEFAULT_RATE = 1;
const PREF_VERSION = "v1";

/** Strip Markdown / HTML to readable plain text. Web Speech reads
 *  raw markdown literally ("hash hash hash Title") — we want the
 *  body, not the markup. Light-weight string replaces; no AST. */
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

export function TextNarrator({ text, className, preferenceKey }: Props) {
  // Self-gate: SSR + unsupported browsers render nothing. No caller
  // needs to compute canPlay; the component does it itself.
  const supported =
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(
    () => loadPref<string | null>(preferenceKey ? `${preferenceKey}.voice` : undefined, null),
  );
  const [rate, setRate] = useState<number>(
    () => loadPref<number>(preferenceKey ? `${preferenceKey}.rate` : undefined, DEFAULT_RATE),
  );
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">(
    "idle",
  );
  const [activeWordIdx, setActiveWordIdx] = useState<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const spoken = useMemo(() => plainTextFromMarkdown(text || ""), [text]);
  const words = useMemo(() => spoken.split(/\s+/).filter(Boolean), [spoken]);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    getBrowserVoices()
      .then((vs) => {
        if (cancelled) return;
        const mapped: VoiceOption[] = vs.map((v) => ({
          id: v.voice_id,
          name: v.name,
          lang: (v.labels?.lang as string) ?? "en",
        }));
        setVoices(mapped);
        if (!voiceId && mapped.length > 0) {
          setVoiceId(mapped[0]!.id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // voiceId intentionally excluded; the effect only seeds the
    // initial default. User selections persist through `setVoiceId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Cancel any in-progress narration when the text changes (lesson
  // switch) or the component unmounts. Prevents the previous
  // utterance from continuing into a different page.
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      stopSpeaking();
    };
  }, [text]);

  const onPlay = useCallback(() => {
    if (!supported || !spoken) return;
    setStatus("loading");
    setActiveWordIdx(null);
    const cancel = speak({
      text: spoken,
      voiceId: voiceId ?? undefined,
      rate,
      onBoundary: (idx) => {
        setActiveWordIdx(idx);
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
    });
    cancelRef.current = cancel;
    // Some browsers fire onboundary slowly; flip to playing immediately
    // so the UI is responsive even before the first boundary event.
    setStatus("playing");
  }, [supported, spoken, voiceId, rate]);

  const onPause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [supported]);

  const onResume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setStatus("playing");
  }, [supported]);

  const onStop = useCallback(() => {
    cancelRef.current?.();
    stopSpeaking();
    setStatus("idle");
    setActiveWordIdx(null);
  }, []);

  const onChangeVoice = useCallback(
    (id: string) => {
      setVoiceId(id);
      savePref(preferenceKey ? `${preferenceKey}.voice` : undefined, id);
      // If we're mid-playback, restart so the new voice takes effect
      // immediately rather than at the next play.
      if (status === "playing" || status === "paused") {
        onStop();
      }
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

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <Headphones className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Listen
        </span>
      </div>

      {status === "idle" && (
        <Button size="sm" variant="outline" onClick={onPlay} disabled={!voiceId}>
          <Play className="h-3.5 w-3.5 mr-1" />
          Play
        </Button>
      )}
      {status === "loading" && (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          Starting…
        </Button>
      )}
      {status === "playing" && (
        <Button size="sm" variant="outline" onClick={onPause}>
          <Pause className="h-3.5 w-3.5 mr-1" />
          Pause
        </Button>
      )}
      {status === "paused" && (
        <Button size="sm" variant="outline" onClick={onResume}>
          <Play className="h-3.5 w-3.5 mr-1" />
          Resume
        </Button>
      )}
      {status !== "idle" && (
        <Button size="sm" variant="ghost" onClick={onStop} aria-label="Stop narration">
          <Square className="h-3.5 w-3.5" />
        </Button>
      )}

      {voices.length > 0 && (
        <Select value={voiceId ?? undefined} onValueChange={onChangeVoice}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Voice" />
          </SelectTrigger>
          <SelectContent>
            {voices.map((v) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                {v.name} · {v.lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-2 min-w-[140px]">
        <span className="text-xs text-muted-foreground">Speed</span>
        <Slider
          value={[rate]}
          min={0.7}
          max={1.8}
          step={0.05}
          onValueChange={onChangeRate}
          className="flex-1"
          aria-label="Narration speed"
        />
        <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
          {rate.toFixed(2)}×
        </span>
      </div>

      {activeWordIdx != null && words.length > 0 && status === "playing" && (
        <span className="text-xs text-muted-foreground tabular-nums hidden md:inline">
          {Math.min(activeWordIdx + 1, words.length)} / {words.length}
        </span>
      )}

      {/* Quick-set rate chips — keeps the common cases one tap away
          while leaving the slider for fine-grain control. */}
      <div className="hidden lg:flex items-center gap-1">
        {RATE_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChangeRate([opt.value])}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border",
              Math.abs(rate - opt.value) < 0.01
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted text-muted-foreground hover:bg-muted/60",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default TextNarrator;
