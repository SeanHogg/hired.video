/**
 * Where a studio format's left-panel tabs sit in the workspace rail — data,
 * so the rail never branches on a kind. Each format puts what it can't work
 * without in a Simple slot (an image's drawing tools under Design, a game's
 * levels under Sections and its sprites under Media, an animation's frames
 * under Sections); time-based formats keep Scenes and Elements in the
 * Advanced slots, like a kit. Layers is the rail's own (rendered by the
 * host for kinds with a layer model).
 */
import type { FocusLeftTabId } from "@/lib/studio/use-focus-left-panel";
import type { RailToolId } from "./workspace-panels";

export type StudioToolFamily = "timeline" | "image" | "game" | "animation" | "document" | "other";

const SLOTS: Record<StudioToolFamily, Partial<Record<FocusLeftTabId, RailToolId>>> = {
  timeline: { ai: "chat", scenes: "scenes", widgets: "elements", media: "media" },
  image: { ai: "chat", widgets: "design" },
  game: { ai: "chat", scenes: "sections", widgets: "media" },
  animation: { ai: "chat", scenes: "sections", widgets: "design" },
  document: { ai: "chat", widgets: "design", media: "media" },
  other: { ai: "chat" },
};

/** The rail slot a format's tab lands in (null → the format has no such tab). */
export function railSlotFor(family: StudioToolFamily, tab: FocusLeftTabId): RailToolId | null {
  return SLOTS[family][tab] ?? null;
}

/** The format's tab behind a rail slot, if any. */
export function tabForRailSlot(family: StudioToolFamily, tool: RailToolId): FocusLeftTabId | null {
  const entry = Object.entries(SLOTS[family]).find(([, slot]) => slot === tool);
  return (entry?.[0] as FocusLeftTabId | undefined) ?? null;
}
