/**
 * TextTrack — the strip's Text row (Advanced): one block per on-screen text
 * item of each scene (kicker, headline, lines; skill pills as one block),
 * placed at the time it shows within its scene. Clicking a block selects
 * that scene and opens the text in the on-frame editor; dragging a block's
 * edges (TimeHandle — or arrow keys on them) sets when it appears and leaves.
 */
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { VideoSceneId } from "@shared/video-plan";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { SceneTime } from "@/lib/build/frame-edits";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import { dragTextBlockEdge, sceneTextBlocks, type TextBlock } from "@/lib/build/text-track";
import { secondsPerPxOf, TRACK_CELL_SELECTOR } from "@/lib/build/strip-geometry";
import { cn } from "@/lib/utils";
import TrackRow, { spanStyle, TrackCell } from "./TrackRow";
import TimeHandle from "./TimeHandle";

interface TextTrackProps {
  scenes: ReadonlyArray<{ id: VideoSceneId }>;
  times: SceneTime[];
  canvas: CanvasState;
  columns: string;
  selectedWidgetId: string | null;
  onEdit: (sceneId: VideoSceneId, block: TextBlock) => void;
  onRetime: (sceneId: VideoSceneId, block: TextBlock, from: number, to: number) => void;
}

export default function TextTrack({ scenes, times, canvas, columns, selectedWidgetId, onEdit, onRetime }: TextTrackProps) {
  const { t } = useTranslation();
  const blocksByScene = useMemo(() => new Map(scenes.map((s) => [s.id, sceneTextBlocks(canvas, s.id)])), [scenes, canvas]);

  return (
    <TrackRow label={t("workspace.strip.text.label")} columns={columns}>
      {scenes.map((s) => {
        const seconds = times.find((x) => x.id === s.id)?.duration ?? 0;
        const blocks = blocksByScene.get(s.id) ?? [];
        return (
          <TrackCell key={s.id} label={t(SCENE_LABEL_KEYS[s.id])}>
            {blocks.map((block, i) => {
              const selected = block.members.some((m) => m.widgetId === selectedWidgetId);
              const edit = () => onEdit(s.id, block);
              const label = block.label || t(`workspace.strip.text.kind.${block.kind}`);
              return (
                <div
                  key={block.key}
                  className="group absolute inset-y-1 min-w-[12px]"
                  style={{ ...spanStyle(block.from, block.to, seconds), zIndex: selected ? blocks.length + 1 : i + 1 }}
                >
                  <button
                    type="button"
                    onClick={edit}
                    aria-pressed={selected}
                    aria-label={t("workspace.strip.text.block", { text: label, from: block.from.toFixed(1), to: block.to.toFixed(1) })}
                    className={cn(
                      // The block may be narrow in time: a transparent 44px-wide hit area.
                      "relative h-full w-full rounded border bg-primary/10 text-left text-[11px] font-medium text-foreground transition-colors hover:bg-primary/20",
                      "after:absolute after:inset-y-0 after:left-1/2 after:w-full after:min-w-11 after:-translate-x-1/2",
                      selected ? "border-primary ring-2 ring-primary" : "border-primary/40",
                    )}
                  >
                    <span className="block truncate px-1.5">{label}</span>
                  </button>
                  <BlockEdge edge="start" block={block} seconds={seconds} onRetime={(from, to) => onRetime(s.id, block, from, to)} onTap={edit} label={t("workspace.strip.text.start")} />
                  <BlockEdge edge="end" block={block} seconds={seconds} onRetime={(from, to) => onRetime(s.id, block, from, to)} onTap={edit} label={t("workspace.strip.text.end")} />
                </div>
              );
            })}
          </TrackCell>
        );
      })}
    </TrackRow>
  );
}

interface BlockEdgeProps {
  edge: "start" | "end";
  block: TextBlock;
  /** The scene's length. */
  seconds: number;
  onRetime: (from: number, to: number) => void;
  onTap: () => void;
  label: string;
}

/** A block's edge: moves when the text appears / leaves within its scene. */
function BlockEdge({ edge, block, seconds, onRetime, onTap, label }: BlockEdgeProps) {
  // The block as it was when the gesture began (deltas are from there).
  const start = useRef(block);
  return (
    <TimeHandle
      label={label}
      value={edge === "start" ? block.from : block.to}
      max={seconds}
      secondsPerPx={secondsPerPxOf(TRACK_CELL_SELECTOR, seconds)}
      onBegin={() => {
        start.current = block;
      }}
      onDelta={(d) => {
        const next = dragTextBlockEdge(start.current, edge, d, seconds);
        onRetime(next.from, next.to);
      }}
      onTap={onTap}
      className={edge === "start" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}
    />
  );
}
