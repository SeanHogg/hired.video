/**
 * The widget catalog: every widget kind a user can insert from scratch
 * (kind → label + icon + palette group), the per-mediaKind availability
 * gate, and the insertable kinds for a mediaKind. Read by the palette
 * (WidgetPalette), LayersPanel's per-widget icons and the studio-editor
 * bridge's `insertableWidgetKinds` — one list, so the click path and the
 * AI CHRO's `studio_insert_widget` tool never disagree.
 */
import {
  Type,
  Heading1,
  Image as ImageIcon,
  Video as VideoIcon,
  Square,
  Circle,
  Minus,
  BarChart3,
  Camera,
  Tags,
  Megaphone,
  MessageCircle,
  Captions,
  Zap,
  UserCircle,
  Stamp,
} from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetKind } from "./canvas-state";

export interface WidgetPaletteItem {
  kind: WidgetKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: "text" | "media" | "shape" | "layout" | "data" | "comic" | "ai";
  /** When set, only show the tile when the active project's mediaKind
   *  is in this list. Keeps the comic-native primitives out of the
   *  Video palette so the surface doesn't bloat for the dominant flow.
   *  Omitted = show everywhere. */
  mediaKinds?: readonly string[];
}

export const WIDGET_CATALOG: WidgetPaletteItem[] = [
  { kind: "heading", label: "Heading", icon: Heading1, group: "text" },
  { kind: "text", label: "Text", icon: Type, group: "text" },
  { kind: "chips", label: "Chips", icon: Tags, group: "text" },
  // Media-group entries stay in the catalog so `LayersPanel` can look
  // up icons for image / video / webcam widgets by kind. The tiles
  // themselves now render from `MediaSection` (shared with ActionsPanel).
  { kind: "image", label: "Image", icon: ImageIcon, group: "media" },
  { kind: "video", label: "Video", icon: VideoIcon, group: "media" },
  { kind: "webcam", label: "Webcam", icon: Camera, group: "media" },
  { kind: "avatar", label: "AI Presenter", icon: UserCircle, group: "ai" },
  { kind: "shape-rect", label: "Rectangle", icon: Square, group: "shape" },
  { kind: "shape-circle", label: "Circle", icon: Circle, group: "shape" },
  { kind: "divider", label: "Divider", icon: Minus, group: "layout" },
  { kind: "chart", label: "Chart", icon: BarChart3, group: "data" },
  { kind: "cta", label: "CTA card", icon: Megaphone, group: "layout" },
  { kind: "brand-kit", label: "Brand kit", icon: Stamp, group: "layout" },
  // Comic-native primitives — only surface in the palette when the
  // active project is a comic. They're functional on any mediaKind (a
  // talking-head video can drop a speech bubble) but the picker stays
  // focused per kind to keep the surface uncluttered.
  { kind: "speech-bubble", label: "Speech bubble", icon: MessageCircle, group: "comic", mediaKinds: ["comic"] },
  { kind: "caption-box",   label: "Caption",       icon: Captions,       group: "comic", mediaKinds: ["comic"] },
  { kind: "sfx-burst",     label: "SFX burst",     icon: Zap,            group: "comic", mediaKinds: ["comic"] },
];

/** The catalog's per-mediaKind gate in ONE place: a tile with no
 *  `mediaKinds` shows everywhere; one with `mediaKinds: ["comic"]` only
 *  when the active project is a comic. Shared by the palette render loop
 *  and `insertableWidgetKindsFor` so the click path and the AI CHRO's
 *  `studio_insert_widget` tool never disagree on what's available. */
export function isCatalogItemAvailable(item: WidgetPaletteItem, mediaKind?: string): boolean {
  return (
    !item.mediaKinds ||
    (mediaKind !== undefined && item.mediaKinds.includes(mediaKind))
  );
}

/** Widget kinds a user can insert from scratch for the given mediaKind. */
export function insertableWidgetKindsFor(mediaKind?: string): WidgetKind[] {
  return WIDGET_CATALOG.filter((i) => isCatalogItemAvailable(i, mediaKind)).map(
    (i) => i.kind,
  );
}
