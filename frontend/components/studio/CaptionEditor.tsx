"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Download,
  Subtitles,
  Edit3,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

type CaptionStyle = "standard" | "bold-pop" | "word-by-word" | "lower-thirds";

interface CaptionEditorProps {
  cues: CaptionCue[];
  onCuesChange?: (cues: CaptionCue[]) => void;
  style: CaptionStyle;
  onStyleChange?: (style: CaptionStyle) => void;
  srtContent?: string;
  vttContent?: string;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function parseTimeInput(value: string): number | null {
  // Accept formats: "M:SS.mmm", "M:SS", "H:MM:SS.mmm", "SS.mmm", "SS"
  const parts = value.split(":");
  let totalSeconds = 0;

  try {
    if (parts.length === 3) {
      totalSeconds =
        parseInt(parts[0], 10) * 3600 +
        parseInt(parts[1], 10) * 60 +
        parseFloat(parts[2]);
    } else if (parts.length === 2) {
      totalSeconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 1) {
      totalSeconds = parseFloat(parts[0]);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  if (isNaN(totalSeconds) || totalSeconds < 0) return null;
  return totalSeconds;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateSrt(cues: CaptionCue[]): string {
  return cues
    .map((cue, i) => {
      const start = formatSrtTime(cue.start);
      const end = formatSrtTime(cue.end);
      return `${i + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join("\n");
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function generateVtt(cues: CaptionCue[]): string {
  const lines = cues.map((cue) => {
    const start = formatVttTime(cue.start);
    const end = formatVttTime(cue.end);
    return `${start} --> ${end}\n${cue.text}`;
  });
  return `WEBVTT\n\n${lines.join("\n\n")}\n`;
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Style metadata
// ---------------------------------------------------------------------------

function getStyleOptions(
  t: TFunction,
): { value: CaptionStyle; label: string; description: string }[] {
  return [
    { value: "standard", label: t("studio.captions.style.standard.label"), description: t("studio.captions.style.standard.description") },
    { value: "bold-pop", label: t("studio.captions.style.boldPop.label"), description: t("studio.captions.style.boldPop.description") },
    { value: "word-by-word", label: t("studio.captions.style.wordByWord.label"), description: t("studio.captions.style.wordByWord.description") },
    { value: "lower-thirds", label: t("studio.captions.style.lowerThirds.label"), description: t("studio.captions.style.lowerThirds.description") },
  ];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Style selector grid */
function StyleSelector({
  style,
  onStyleChange,
}: {
  style: CaptionStyle;
  onStyleChange?: (style: CaptionStyle) => void;
}) {
  const { t } = useTranslation();
  const options = getStyleOptions(t);
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{t("studio.captions.styleHeading")}</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStyleChange?.(opt.value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
              style === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              {opt.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live preview panel showing how captions will look */
function CaptionPreview({
  cue,
  style,
}: {
  cue: CaptionCue | null;
  style: CaptionStyle;
}) {
  const { t } = useTranslation();
  if (!cue) {
    return (
      <div className="relative flex h-32 items-end justify-center rounded-lg bg-black/90 p-4">
        <span className="text-xs text-muted-foreground">
          {t("studio.captions.previewPlaceholder")}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-32 items-end justify-center rounded-lg bg-black/90 overflow-hidden">
      {/* Lower thirds background bar */}
      {style === "lower-thirds" && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-accent/50" />
      )}

      <div
        className={cn("relative z-10 pb-4 px-4 text-center max-w-full", {
          // Standard
          "text-white text-sm font-medium drop-shadow-lg": style === "standard",
          // Bold pop
          "text-white text-base font-extrabold uppercase tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]":
            style === "bold-pop",
          // Word-by-word - render each word with alternating highlight
          "text-white text-sm font-semibold": style === "word-by-word",
          // Lower thirds
          "text-white text-sm font-medium pb-3": style === "lower-thirds",
        })}
      >
        {style === "word-by-word" && cue.words && cue.words.length > 0 ? (
          <span className="flex flex-wrap justify-center gap-x-1.5">
            {cue.words.map((w, i) => (
              <span
                key={`${w.word}-${i}`}
                className={cn(
                  "transition-colors",
                  i === 0
                    ? "text-primary-foreground bg-primary rounded px-1"
                    : "text-white/70",
                )}
              >
                {w.word}
              </span>
            ))}
          </span>
        ) : (
          <span>{cue.text}</span>
        )}
      </div>
    </div>
  );
}

/** Editable cue row */
function CueRow({
  cue,
  index,
  isEditing,
  onStartEdit,
  onTextChange,
  onStartTimeChange,
  onEndTimeChange,
  onStopEdit,
}: {
  cue: CaptionCue;
  index: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onTextChange: (text: string) => void;
  onStartTimeChange: (start: number) => void;
  onEndTimeChange: (end: number) => void;
  onStopEdit: () => void;
}) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const handleStartBlur = () => {
    if (startRef.current) {
      const parsed = parseTimeInput(startRef.current.value);
      if (parsed !== null) {
        onStartTimeChange(parsed);
      }
    }
  };

  const handleEndBlur = () => {
    if (endRef.current) {
      const parsed = parseTimeInput(endRef.current.value);
      if (parsed !== null) {
        onEndTimeChange(parsed);
      }
    }
  };

  return (
    <div
      className={cn(
        "group rounded-lg border p-3 transition-colors",
        isEditing
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Cue number */}
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Timestamps */}
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            {isEditing ? (
              <>
                <Input
                  ref={startRef}
                  defaultValue={formatTime(cue.start)}
                  onBlur={handleStartBlur}
                  className="h-7 w-[100px] text-xs font-mono px-2"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  ref={endRef}
                  defaultValue={formatTime(cue.end)}
                  onBlur={handleEndBlur}
                  className="h-7 w-[100px] text-xs font-mono px-2"
                />
              </>
            ) : (
              <span className="font-mono text-muted-foreground">
                {formatTime(cue.start)} - {formatTime(cue.end)}
              </span>
            )}
          </div>

          {/* Text */}
          {isEditing ? (
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              rows={2}
              value={cue.text}
              onChange={(e) => onTextChange(e.target.value)}
              onBlur={onStopEdit}
              autoFocus
            />
          ) : (
            <p
              className="text-sm leading-relaxed cursor-pointer"
              onClick={onStartEdit}
            >
              {cue.text}
            </p>
          )}
        </div>

        {/* Edit button (visible on hover, or when not editing) */}
        {!isEditing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={onStartEdit}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CaptionEditor({
  cues,
  onCuesChange,
  style,
  onStyleChange,
  srtContent,
  vttContent,
  enabled = true,
  onToggle,
}: CaptionEditorProps) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [previewCueIndex, setPreviewCueIndex] = useState(0);

  // Clamp preview index to valid range
  const safePreviewIndex = Math.min(
    Math.max(previewCueIndex, 0),
    cues.length - 1,
  );
  const previewCue = cues.length > 0 ? cues[safePreviewIndex] : null;

  // --- Cue mutation helpers ---
  const updateCue = useCallback(
    (index: number, patch: Partial<CaptionCue>) => {
      if (!onCuesChange) return;
      const updated = cues.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      );
      onCuesChange(updated);
    },
    [cues, onCuesChange],
  );

  // --- Export helpers ---
  const handleExportSrt = useCallback(() => {
    const content = srtContent ?? generateSrt(cues);
    downloadFile(content, "captions.srt", "text/plain");
  }, [srtContent, cues]);

  const handleExportVtt = useCallback(() => {
    const content = vttContent ?? generateVtt(cues);
    downloadFile(content, "captions.vtt", "text/vtt");
  }, [vttContent, cues]);

  // Caption count summary
  const duration = useMemo(() => {
    if (cues.length === 0) return 0;
    return cues[cues.length - 1].end - cues[0].start;
  }, [cues]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <Subtitles className="h-5 w-5 text-primary" />
            {t("studio.captions.heading")}
          </span>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              {t("studio.captions.cueCount", { count: cues.length })}
            </Badge>
            {onToggle && (
              <div className="flex items-center gap-2">
                <Label htmlFor="caption-toggle" className="text-xs text-muted-foreground">
                  {enabled ? t("labels.on") : t("labels.off")}
                </Label>
                <Switch
                  id="caption-toggle"
                  checked={enabled}
                  onCheckedChange={onToggle}
                />
              </div>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ---- Preview ---- */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("studio.captions.previewLabel")}</Label>
          <CaptionPreview cue={previewCue} style={style} />
          {cues.length > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={safePreviewIndex === 0}
                onClick={() => setPreviewCueIndex((p) => Math.max(0, p - 1))}
              >
                {t("studio.captions.prev")}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {safePreviewIndex + 1} / {cues.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={safePreviewIndex >= cues.length - 1}
                onClick={() =>
                  setPreviewCueIndex((p) => Math.min(cues.length - 1, p + 1))
                }
              >
                {t("actions.next")}
              </Button>
            </div>
          )}
        </div>

        {/* ---- Style selector ---- */}
        <StyleSelector style={style} onStyleChange={onStyleChange} />

        {/* ---- Cue list ---- */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t("studio.captions.captionsHeading")}</Label>
            {duration > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {t("studio.captions.totalDuration", { time: formatTime(duration) })}
              </span>
            )}
          </div>

          {cues.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Subtitles className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t("studio.captions.emptyState")}
              </p>
            </div>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
              {cues.map((cue, i) => (
                <CueRow
                  key={i}
                  cue={cue}
                  index={i}
                  isEditing={editingIndex === i}
                  onStartEdit={() => {
                    setEditingIndex(i);
                    setPreviewCueIndex(i);
                  }}
                  onTextChange={(text) => updateCue(i, { text })}
                  onStartTimeChange={(start) => updateCue(i, { start })}
                  onEndTimeChange={(end) => updateCue(i, { end })}
                  onStopEdit={() => setEditingIndex(null)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ---- Export buttons ---- */}
        {cues.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleExportSrt}
            >
              <Download className="h-4 w-4" />
              {t("studio.captions.exportSrt")}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleExportVtt}
            >
              <Download className="h-4 w-4" />
              {t("studio.captions.exportVtt")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
