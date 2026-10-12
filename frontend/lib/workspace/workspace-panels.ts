/**
 * The workspace registry — WHAT the fixed frame holds, as data. Every surface
 * (a career kit's résumé / letter / video pages, and every studio format)
 * renders the same regions in the same places:
 *
 *   header   ← · title · Saved · Undo · Redo · Preview · Simple|Advanced · ⋯
 *   stepper  (kits) Create → Promote, Next = the one primary button
 *   rail     300px: icon rail + the open tool's panel
 *   canvas   the page / frame / runtime surface
 *   strip    150px: the timeline (time-based) or the document's pages
 *   slot     ONE right slide-out (✕ to close): inspector | post | tool
 *
 * Advanced only APPENDS: an entry whose depth is "advanced" is added at the
 * END of its region; nothing moves, nothing resizes (workspace-frame.test).
 * A tool that does not apply to the open page greys out — it never hides.
 * Adding a tool or a ⋯ item is one entry here plus its content in the
 * surface's builder (a `Record<…Id, …>`, so the compiler checks coverage).
 *
 * Pure data (lucide icons are plain components) so the parity test can read
 * it without rendering.
 */
import type { ComponentType } from "react";
import {
  Clapperboard,
  Code2,
  Download,
  History,
  Info,
  Layers,
  LayoutList,
  Library,
  MessageSquare,
  MessagesSquare,
  Image as ImageIcon,
  Palette,
  Shapes,
  UserPlus,
} from "lucide-react";
import type { WorkspaceDepth } from "./workspace-depth";

/** Which family of workspace is showing. A kit is a studio project carrying
 *  a `resume_video` subject (the résumé, its letter and its video). */
export type WorkspaceSurface = "kit" | "studio";

type Icon = ComponentType<{ className?: string }>;

// ── Frame tokens (px) — the frame test asserts these never change with depth.
export const RAIL_WIDTH_PX = 450;
export const STRIP_HEIGHT_PX = 150;
/** The strip on phones. */
export const STRIP_HEIGHT_PHONE_PX = 84;

// ── Rail tools ───────────────────────────────────────────────────────────
export const RAIL_TOOL_IDS = ["chat", "design", "sections", "media", "scenes", "elements", "layers"] as const;
export type RailToolId = (typeof RAIL_TOOL_IDS)[number];

/** `?tool=` → a rail tool, or null. */
export function parseRailTool(value: string | null): RailToolId | null {
  return (RAIL_TOOL_IDS as readonly string[]).includes(value ?? "") ? (value as RailToolId) : null;
}

export interface RailToolDef {
  id: RailToolId;
  labelKey: string;
  icon: Icon;
  /** Simple tools show in both depths; Advanced ones are appended after
   *  them. The same for every format: a studio format puts what it can't
   *  work without in a Simple slot (a game's levels and an animation's
   *  frames under Sections, drawing tools under Design). */
  depth: WorkspaceDepth;
}

export const RAIL_TOOLS: readonly RailToolDef[] = [
  { id: "chat", labelKey: "workspace.tool.chat", icon: MessageSquare, depth: "simple" },
  { id: "design", labelKey: "workspace.tool.design", icon: Palette, depth: "simple" },
  { id: "sections", labelKey: "workspace.tool.sections", icon: LayoutList, depth: "simple" },
  { id: "media", labelKey: "workspace.tool.media", icon: ImageIcon, depth: "simple" },
  { id: "scenes", labelKey: "workspace.tool.scenes", icon: Clapperboard, depth: "advanced" },
  { id: "elements", labelKey: "workspace.tool.elements", icon: Shapes, depth: "advanced" },
  { id: "layers", labelKey: "workspace.tool.layers", icon: Layers, depth: "advanced" },
];

// ── ⋯ menu ───────────────────────────────────────────────────────────────
export const MORE_ITEM_IDS = ["details", "download", "saveAs", "versions", "embed", "reviewing", "invite"] as const;
export type MoreItemId = (typeof MORE_ITEM_IDS)[number];

export interface MoreItemDef {
  id: MoreItemId;
  labelKey: string;
  icon: Icon;
  depth: WorkspaceDepth;
}

export const MORE_ITEMS: readonly MoreItemDef[] = [
  { id: "details", labelKey: "workspace.more.details", icon: Info, depth: "simple" },
  { id: "download", labelKey: "workspace.more.download", icon: Download, depth: "simple" },
  { id: "saveAs", labelKey: "workspace.more.saveAs", icon: Library, depth: "simple" },
  { id: "versions", labelKey: "workspace.more.versions", icon: History, depth: "simple" },
  { id: "embed", labelKey: "workspace.more.embed", icon: Code2, depth: "advanced" },
  { id: "reviewing", labelKey: "workspace.more.reviewing", icon: MessagesSquare, depth: "advanced" },
  { id: "invite", labelKey: "workspace.more.invite", icon: UserPlus, depth: "advanced" },
];

// ── The right slot ───────────────────────────────────────────────────────
export const SLOT_PANEL_IDS = ["inspector", "post", "tool"] as const;
export type SlotPanelId = (typeof SLOT_PANEL_IDS)[number];

/** Width of each slot panel. ONE slot: opening one replaces the other. */
export const SLOT_WIDTH_PX: Record<SlotPanelId, number> = { inspector: 400, post: 400, tool: 672 };

// ── Header controls (fixed order, both depths) ──────────────────────────
export const HEADER_CONTROL_IDS = [
  "back",
  "title",
  "saveStatus",
  "undo",
  "redo",
  "preview",
  "depth",
  "more",
  "post",
] as const;
export type HeaderControlId = (typeof HEADER_CONTROL_IDS)[number];

// ── Canvas surfaces, strip contents, studio home sections ───────────────
export const CANVAS_SURFACE_IDS = ["resumePage", "letterPage", "kitVideo", "dropZone", "runtime"] as const;
export type CanvasSurfaceId = (typeof CANVAS_SURFACE_IDS)[number];

export const STRIP_CONTENT_IDS = ["sceneRows", "tracks", "pages"] as const;
export type StripContentId = (typeof STRIP_CONTENT_IDS)[number];

export const HOME_SECTION_IDS = ["newMenu", "dropZone", "yourWork", "templates", "workspaceSwitcher"] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

/** Rail tools in order, at a depth. Advanced entries come
 *  after the Simple ones (they are appended, never interleaved). */
export function railToolsFor(depth: WorkspaceDepth): readonly RailToolDef[] {
  return RAIL_TOOLS.filter((tool) => tool.depth === "simple" || depth === "advanced");
}

/** ⋯ items in order at a depth (Advanced ones appended at the end). */
export function moreItemsFor(depth: WorkspaceDepth): readonly MoreItemDef[] {
  return MORE_ITEMS.filter((item) => item.depth === "simple" || depth === "advanced");
}
