/**
 * CaptionsTrack — the strip's Captions row (Advanced): each scene's
 * voiceover cut into caption chunks, placed at the time they're spoken.
 * The header switches captions on/off for the video and picks their style
 * (position, size); clicking a chunk rewords it in place. While captions
 * are off the chunks show dimmed — what you would get.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { CAPTION_POSITIONS, CAPTION_SIZES, CAPTION_TEXT_MAX, type CaptionPosition, type CaptionSize, type VideoSceneId } from "@shared/video-plan";
import type { SceneTime } from "@/lib/build/frame-edits";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import type { CaptionChunk, SceneCaptions } from "@/lib/build/captions";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import TrackRow, { spanStyle, TrackCell } from "./TrackRow";

interface CaptionsTrackProps {
  scenes: ReadonlyArray<{ id: VideoSceneId }>;
  times: SceneTime[];
  captions: SceneCaptions;
  columns: string;
  on: boolean;
  position: CaptionPosition;
  size: CaptionSize;
  onToggle: (on: boolean) => void;
  onStyle: (patch: Partial<{ position: CaptionPosition; size: CaptionSize }>) => void;
  /** A chunk was picked (seek the player to it). */
  onPick: (sceneId: VideoSceneId, chunk: CaptionChunk) => void;
  onReword: (sceneId: VideoSceneId, from: string, text: string) => void;
}

const POSITION_KEYS: Record<CaptionPosition, string> = {
  bottom: "workspace.strip.captions.positionBottom",
  middle: "workspace.strip.captions.positionMiddle",
  top: "workspace.strip.captions.positionTop",
};
const SIZE_KEYS: Record<CaptionSize, string> = {
  s: "workspace.strip.captions.sizeS",
  m: "workspace.strip.captions.sizeM",
  l: "workspace.strip.captions.sizeL",
};

export default function CaptionsTrack(props: CaptionsTrackProps) {
  const { scenes, times, captions, columns, on, position, size, onToggle, onStyle, onPick, onReword } = props;
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ sceneId: VideoSceneId; index: number } | null>(null);
  const hasAny = scenes.some((s) => (captions[s.id]?.length ?? 0) > 0);

  const controls = (
    <>
      {/* The label carries the switch's 44px tap target. */}
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1">
        <Switch checked={on} onCheckedChange={onToggle} aria-label={t("workspace.strip.captions.toggle")} />
        <span className="text-[11px] text-muted-foreground">{on ? t("workspace.strip.captions.on") : t("workspace.strip.captions.off")}</span>
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("workspace.strip.captions.style")}
          title={t("workspace.strip.captions.style")}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>{t("workspace.strip.captions.position")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={position} onValueChange={(v) => onStyle({ position: v as CaptionPosition })}>
            {CAPTION_POSITIONS.map((p) => (
              <DropdownMenuRadioItem key={p} value={p}>
                {t(POSITION_KEYS[p])}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("workspace.strip.captions.size")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={size} onValueChange={(v) => onStyle({ size: v as CaptionSize })}>
            {CAPTION_SIZES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                {t(SIZE_KEYS[s])}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {!hasAny && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{t("workspace.strip.captions.empty")}</span>}
    </>
  );

  return (
    <TrackRow label={t("workspace.strip.captions.label")} controls={controls} columns={columns}>
      {scenes.map((s) => {
        const seconds = times.find((x) => x.id === s.id)?.duration ?? 0;
        return (
          <TrackCell key={s.id} label={t(SCENE_LABEL_KEYS[s.id])}>
            {(captions[s.id] ?? []).map((chunk) => {
              const style = spanStyle(chunk.start, chunk.end, seconds);
              if (editing?.sceneId === s.id && editing.index === chunk.index) {
                return (
                  <ChunkEditor
                    key={chunk.index}
                    left={style.left}
                    initial={chunk.text}
                    label={t("workspace.strip.captions.editChunk")}
                    onDone={(text) => {
                      setEditing(null);
                      if (text !== null && text !== chunk.text) onReword(s.id, chunk.from, text);
                    }}
                  />
                );
              }
              return (
                <button
                  key={chunk.index}
                  type="button"
                  onClick={() => {
                    onPick(s.id, chunk);
                    setEditing({ sceneId: s.id, index: chunk.index });
                  }}
                  aria-label={t("workspace.strip.captions.chunk", { text: chunk.text })}
                  title={chunk.text}
                  style={style}
                  className={cn(
                    // A chunk may be narrow in time: a transparent 44px-wide hit area.
                    "absolute inset-y-1 min-w-[8px] rounded border border-border bg-card text-left text-[10.5px] text-foreground hover:border-primary/60",
                    "after:absolute after:-inset-y-1 after:left-1/2 after:w-full after:min-w-11 after:-translate-x-1/2",
                    !on && "opacity-60",
                    chunk.edited && "italic",
                  )}
                >
                  <span className="block truncate px-1">{chunk.text}</span>
                </button>
              );
            })}
          </TrackCell>
        );
      })}
    </TrackRow>
  );
}

interface ChunkEditorProps {
  left: string;
  initial: string;
  label: string;
  /** The new wording, or null when cancelled. */
  onDone: (text: string | null) => void;
}

/** Inline rewording: Enter or leaving the field keeps it, Esc cancels. */
function ChunkEditor({ left, initial, label, onDone }: ChunkEditorProps) {
  const [value, setValue] = useState(initial);
  const settled = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  // Opened by a click on the chunk: focus follows the person's action.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (text: string | null) => {
    if (settled.current) return;
    settled.current = true;
    onDone(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(null);
    }
  };
  return (
    <input
      ref={field}
      value={value}
      maxLength={CAPTION_TEXT_MAX}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value)}
      style={{ left }}
      className="absolute inset-y-0 z-30 w-56 max-w-[70vw] rounded border border-primary bg-card px-2 text-xs text-foreground shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
