/**
 * Text track — the on-screen text of each scene as timeline blocks (the
 * kicker, the headline, each line; a scene's skill pills as one block),
 * placed by when they show within the scene.
 *
 * A block's window IS its widgets' visibility window (`visibleFrom` /
 * `visibleTo`), so retiming a block is the same per-widget window override
 * the frame editor stores (`plan.canvas.widgets[id]`, canvas-overrides.ts) —
 * one timing model for the strip, the Advanced timeline and the export.
 */
import type { VideoPlan, VideoSceneId } from "@shared/video-plan";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { overrideWidgetWindow } from "./canvas-overrides";
import { widgetText } from "./frame-edits";
import { canvasSceneId } from "./scene-voiceover";

export type TextBlockKind = "kicker" | "heading" | "line" | "skills";

export interface TextBlockMember {
  widgetId: string;
  from: number;
  to: number;
}

export interface TextBlock {
  key: string;
  kind: TextBlockKind;
  /** The words, for the block's label. */
  label: string;
  /** Seconds from the scene's start (the earliest / latest member). */
  from: number;
  to: number;
  members: TextBlockMember[];
}

/** Shortest window a text block can be squeezed to (seconds). */
export const TEXT_BLOCK_MIN_SECONDS = 0.3;
/** Drags snap to tenths of a second. */
const SNAP = 0.1;

const PART = /^build-([a-z]+)-(kicker|heading|body-\d+|skill-\d+)$/;

function kindOf(part: string): TextBlockKind {
  if (part === "kicker" || part === "heading") return part;
  return part.startsWith("skill-") ? "skills" : "line";
}

/** The scene's text blocks in the order they appear. */
export function sceneTextBlocks(canvas: CanvasState, sceneId: VideoSceneId): TextBlock[] {
  const scene = canvas.scenes.find((s) => s.id === canvasSceneId(sceneId));
  if (!scene) return [];
  const duration = scene.durationSeconds;
  const blocks: TextBlock[] = [];
  for (const widget of scene.widgets) {
    const m = PART.exec(widget.id);
    if (!m || m[1] !== sceneId) continue;
    const kind = kindOf(m[2]);
    const from = clamp(widget.visibleFrom ?? 0, 0, duration);
    const to = clamp(widget.visibleTo ?? duration, from, duration);
    const member = { widgetId: widget.id, from, to };
    const text = widgetText(widget) ?? "";
    const skills = kind === "skills" ? blocks.find((b) => b.kind === "skills") : undefined;
    if (skills) {
      skills.members.push(member);
      skills.from = Math.min(skills.from, from);
      skills.to = Math.max(skills.to, to);
      if (text) skills.label = skills.label ? `${skills.label} · ${text}` : text;
      continue;
    }
    blocks.push({ key: kind === "skills" ? `${sceneId}-skills` : widget.id, kind, label: text, from, to, members: [member] });
  }
  return blocks.sort((a, b) => a.from - b.from);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const snap = (n: number) => Math.round(n / SNAP) * SNAP;

/** A drag of one edge by `deltaSeconds` → the block's next window, snapped,
 *  kept inside the scene and never shorter than the minimum. */
export function dragTextBlockEdge(
  block: Pick<TextBlock, "from" | "to">,
  edge: "start" | "end",
  deltaSeconds: number,
  sceneSeconds: number,
): { from: number; to: number } {
  if (edge === "start") {
    const from = clamp(snap(block.from + deltaSeconds), 0, Math.max(0, block.to - TEXT_BLOCK_MIN_SECONDS));
    return { from: round(from), to: block.to };
  }
  const to = clamp(snap(block.to + deltaSeconds), Math.min(sceneSeconds, block.from + TEXT_BLOCK_MIN_SECONDS), sceneSeconds);
  return { from: block.from, to: round(to) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The plan with the block retimed to [from, to]: a moved start shifts every
 *  member's start by the same amount (skill pills keep their stagger), a
 *  moved end sets every member's end. One plan → one undo step. */
export function retimeTextBlock(plan: VideoPlan, block: TextBlock, from: number, to: number): VideoPlan {
  const shift = from - block.from;
  return block.members.reduce((next, m) => {
    const mTo = to === block.to ? m.to : to;
    const mFrom = clamp(round(m.from + shift), 0, Math.max(0, mTo - TEXT_BLOCK_MIN_SECONDS));
    return overrideWidgetWindow(next, m.widgetId, mFrom, mTo);
  }, plan);
}
