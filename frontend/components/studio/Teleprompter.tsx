"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  Type,
  Clock,
  ChevronUp,
  ChevronDown,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeleprompterProps {
  text: string;
  isScrolling: boolean;
  onToggleScroll: () => void;
  scrollSpeed?: number; // WPM, default 150
  onScrollSpeedChange?: (wpm: number) => void;
  position?: "top" | "bottom" | "overlay";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WPM = 150;
const MIN_WPM = 50;
const MAX_WPM = 400;
const AVERAGE_WORD_LENGTH = 5; // characters including space

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Split text into sentences for highlighting. */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace, or on double newlines
  const raw = text.split(/(?<=[.!?])\s+|\n{2,}/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Teleprompter({
  text,
  isScrolling,
  onToggleScroll,
  scrollSpeed = DEFAULT_WPM,
  onScrollSpeedChange,
  position = "overlay",
}: TeleprompterProps) {
  const [showControls, setShowControls] = useState(true);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scrollAnimFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  // ---- Derived data ----
  const sentences = useMemo(() => splitIntoSentences(text), [text]);
  const totalWords = useMemo(() => wordCount(text), [text]);

  const wordsBeforeActive = useMemo(() => {
    return sentences
      .slice(0, activeSentenceIndex)
      .reduce((sum, s) => sum + wordCount(s), 0);
  }, [sentences, activeSentenceIndex]);

  const remainingWords = totalWords - wordsBeforeActive;
  const estimatedSecondsRemaining =
    scrollSpeed > 0 ? (remainingWords / scrollSpeed) * 60 : 0;

  // Pixels per millisecond based on WPM. We approximate: each word ~ 5 chars,
  // at typical font size each character ~ 8px, and container shows ~60 chars wide.
  // Instead of character-based calculation we simply derive scroll speed from
  // the total scrollable height and total estimated reading time.
  const totalReadingTimeMs = totalWords > 0 ? (totalWords / scrollSpeed) * 60_000 : 0;

  // ---- Sync sentence refs array length ----
  useEffect(() => {
    sentenceRefs.current = sentenceRefs.current.slice(0, sentences.length);
  }, [sentences.length]);

  // ---- Determine active sentence based on scroll position ----
  const updateActiveSentence = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const highlightY = containerRect.top + containerRect.height * 0.35; // 35% from top

    let closest = 0;
    let closestDist = Infinity;

    sentenceRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(mid - highlightY);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });

    setActiveSentenceIndex(closest);
  }, []);

  // ---- Auto-scroll logic ----
  useEffect(() => {
    if (!isScrolling) {
      // Pause: stop animation loop
      if (scrollAnimFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
        scrollAnimFrameRef.current = null;
      }
      lastTimestampRef.current = null;
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const totalScrollable = container.scrollHeight - container.clientHeight;
    if (totalScrollable <= 0 || totalReadingTimeMs <= 0) return;

    const pxPerMs = totalScrollable / totalReadingTimeMs;

    const step = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }

      const delta = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;

      container.scrollTop += pxPerMs * delta;

      // If we've reached the bottom, stop
      if (container.scrollTop >= totalScrollable) {
        onToggleScroll(); // notify parent scrolling is done
        return;
      }

      updateActiveSentence();
      scrollAnimFrameRef.current = requestAnimationFrame(step);
    };

    scrollAnimFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
        scrollAnimFrameRef.current = null;
      }
      lastTimestampRef.current = null;
    };
  }, [isScrolling, totalReadingTimeMs, onToggleScroll, updateActiveSentence]);

  // ---- Manual scroll handler ----
  const handleManualScroll = useCallback(() => {
    updateActiveSentence();
  }, [updateActiveSentence]);

  // ---- Nudge scroll ----
  const nudgeScroll = useCallback((direction: "up" | "down") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const amount = direction === "up" ? -80 : 80;
    container.scrollBy({ top: amount, behavior: "smooth" });
  }, []);

  // ---- Position classes ----
  const positionClasses = useMemo(() => {
    switch (position) {
      case "top":
        return "top-0 left-0 right-0";
      case "bottom":
        return "bottom-0 left-0 right-0";
      case "overlay":
      default:
        return "inset-0";
    }
  }, [position]);

  const containerHeight = useMemo(() => {
    switch (position) {
      case "top":
      case "bottom":
        return "max-h-[40%]";
      case "overlay":
      default:
        return "h-full";
    }
  }, [position]);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div
      className={cn(
        "absolute z-10 flex flex-col",
        positionClasses,
        containerHeight,
        "pointer-events-auto",
      )}
    >
      {/* ---- Scrollable text area ---- */}
      <div
        ref={scrollContainerRef}
        onScroll={handleManualScroll}
        className={cn(
          "flex-1 overflow-y-auto px-6 py-8",
          position === "overlay"
            ? "bg-black/50 backdrop-blur-sm"
            : "bg-black/70",
        )}
        style={{
          // Generous padding top/bottom so active sentence sits in the
          // visual "reading zone" around 35% from top
          paddingTop: "30%",
          paddingBottom: "60%",
        }}
      >
        <div className="mx-auto max-w-2xl space-y-3">
          {sentences.map((sentence, i) => (
            <span
              key={i}
              ref={(el) => {
                sentenceRefs.current[i] = el;
              }}
              className={cn(
                "block text-lg leading-relaxed transition-all duration-300 md:text-xl lg:text-2xl",
                i === activeSentenceIndex
                  ? "scale-[1.02] font-semibold text-white"
                  : i < activeSentenceIndex
                    ? "text-white/30"
                    : "text-white/60",
              )}
            >
              {sentence}
            </span>
          ))}
        </div>
      </div>

      {/* ---- Control bar ---- */}
      <div
        className={cn(
          "flex items-center gap-2 border-t border-white/10 bg-black/80 px-4 py-2 backdrop-blur-sm transition-opacity",
          showControls ? "opacity-100" : "opacity-0 hover:opacity-100",
        )}
      >
        {/* Play/Pause */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleScroll}
          className="text-white hover:bg-white/10 hover:text-white"
          aria-label={isScrolling ? "Pause scrolling" : "Start scrolling"}
        >
          {isScrolling ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Manual nudge */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => nudgeScroll("up")}
          className="text-white hover:bg-white/10 hover:text-white"
          aria-label="Scroll up"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => nudgeScroll("down")}
          className="text-white hover:bg-white/10 hover:text-white"
          aria-label="Scroll down"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-white/20" />

        {/* Speed control */}
        <Type className="h-4 w-4 shrink-0 text-white/60" />
        <div className="flex w-32 items-center gap-2">
          <Slider
            min={MIN_WPM}
            max={MAX_WPM}
            step={10}
            value={[scrollSpeed]}
            onValueChange={([val]) => onScrollSpeedChange?.(val)}
            className="flex-1"
            aria-label="Scroll speed"
          />
        </div>
        <Badge variant="outline" className="border-white/20 text-white/80">
          {scrollSpeed} WPM
        </Badge>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-white/20" />

        {/* Time remaining */}
        <Clock className="h-4 w-4 shrink-0 text-white/60" />
        <span className="text-xs text-white/60">
          {formatTimeRemaining(estimatedSecondsRemaining)} remaining
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Toggle control bar visibility */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowControls((s) => !s)}
          className="text-white hover:bg-white/10 hover:text-white"
          aria-label="Toggle controls"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
