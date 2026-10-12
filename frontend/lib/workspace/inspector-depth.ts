/**
 * Which inspector sections show at each depth — data, so the properties
 * panel never branches on a widget kind. Simple keeps the plain questions
 * (what it says, where it sits, when it shows; a scene's name, length and
 * background); Advanced APPENDS every other section after them — as rows
 * that open in place (the shared drill rows, components/workspace/inspector)
 * — so nothing above moves. Every section is a row that opens in place;
 * none is an accordion. The canvas-wide DESIGN sections (format, themes, palette,
 * fonts) live in the rail's Design tool at every depth; the rest of the
 * canvas-wide group (motion, music, export, branding) is Advanced only.
 */
import type { WorkspaceDepth } from "./workspace-depth";

const SIMPLE_WIDGET_SECTIONS: ReadonlySet<string> = new Set([
  "content",
  "cta-content",
  "chips-content",
  "linked-content",
  "layout",
  "timing",
]);
const SIMPLE_SCENE_SECTIONS: ReadonlySet<string> = new Set(["scene-basics", "scene-background"]);

/** Whether a section is one of Simple's plain rows (a widget's or a
 *  scene's) — a drill into it stays open at either depth. Pure. */
export function isPlainInspectorSection(id: string): boolean {
  return SIMPLE_WIDGET_SECTIONS.has(id) || SIMPLE_SCENE_SECTIONS.has(id);
}

/** The plain sections, and — Advanced only — the rest, in order. */
export interface SectionsAtDepth<T> {
  plain: T[];
  more: T[];
}

function atDepth<T extends { id: string }>(sections: readonly T[], simple: ReadonlySet<string>, depth: WorkspaceDepth): SectionsAtDepth<T> {
  return {
    plain: sections.filter((s) => simple.has(s.id)),
    more: depth === "advanced" ? sections.filter((s) => !simple.has(s.id)) : [],
  };
}

export function widgetSectionsAt<T extends { id: string }>(sections: readonly T[], depth: WorkspaceDepth): SectionsAtDepth<T> {
  return atDepth(sections, SIMPLE_WIDGET_SECTIONS, depth);
}

export function sceneSectionsAt<T extends { id: string }>(sections: readonly T[], depth: WorkspaceDepth): SectionsAtDepth<T> {
  return atDepth(sections, SIMPLE_SCENE_SECTIONS, depth);
}

const DESIGN_CANVAS_SECTIONS: ReadonlySet<string> = new Set([
  "canvas-format",
  "canvas-themes",
  "canvas-palette",
  "canvas-fonts",
]);

/** The canvas-wide sections the rail's Design tool shows (every depth). */
export function designCanvasSections<T extends { id: string }>(sections: readonly T[]): T[] {
  return sections.filter((s) => DESIGN_CANVAS_SECTIONS.has(s.id));
}

/** The canvas-wide sections the inspector appends under Advanced (Design's
 *  are in the rail, so they don't show twice). */
export function inspectorCanvasSectionsAt<T extends { id: string }>(sections: readonly T[], depth: WorkspaceDepth): T[] {
  return depth === "advanced" ? sections.filter((s) => !DESIGN_CANVAS_SECTIONS.has(s.id)) : [];
}
