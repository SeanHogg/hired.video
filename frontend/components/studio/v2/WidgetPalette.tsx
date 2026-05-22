/**
 * Widget palette — the draggable inventory of canvas elements rendered
 * below the scenes rail. Items are dragged onto the canvas via HTML5
 * dataTransfer (handled by `<CanvasStage onWidgetDrop>`). Click also
 * inserts the widget at a default position.
 *
 * The palette is the SINGLE source of widget metadata. The catalog
 * below is read by ToolPalette here AND by tests that assert every
 * `WidgetKind` has palette coverage.
 *
 * Linked-content kinds (resume / job / future entities) don't appear in
 * `WIDGET_CATALOG` because they're not click-to-add-a-blank — each tile
 * represents a specific user-owned entity. They render in their own
 * `LinkedContentPaletteSection` below the static groups, with the same
 * tile chrome so the two halves of the palette feel unified.
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
  MonitorUp,
  Tags,
  Megaphone,
  MessageCircle,
  Captions,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import LinkedContentPaletteSection from "./LinkedContentPaletteSection";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";

export interface WidgetPaletteItem {
  kind: WidgetKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: "text" | "media" | "shape" | "layout" | "data" | "comic";
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
  { kind: "image", label: "Image", icon: ImageIcon, group: "media" },
  { kind: "video", label: "Video", icon: VideoIcon, group: "media" },
  { kind: "webcam", label: "Webcam", icon: Camera, group: "media" },
  { kind: "shape-rect", label: "Rectangle", icon: Square, group: "shape" },
  { kind: "shape-circle", label: "Circle", icon: Circle, group: "shape" },
  { kind: "divider", label: "Divider", icon: Minus, group: "layout" },
  { kind: "chart", label: "Chart", icon: BarChart3, group: "data" },
  { kind: "cta", label: "CTA card", icon: Megaphone, group: "layout" },
  // Comic-native primitives — only surface in the palette when the
  // active project is a comic. They're functional on any mediaKind (a
  // talking-head video can drop a speech bubble) but the picker stays
  // focused per kind to keep the surface uncluttered.
  { kind: "speech-bubble", label: "Speech bubble", icon: MessageCircle, group: "comic", mediaKinds: ["comic"] },
  { kind: "caption-box",   label: "Caption",       icon: Captions,       group: "comic", mediaKinds: ["comic"] },
  { kind: "sfx-burst",     label: "SFX burst",     icon: Zap,            group: "comic", mediaKinds: ["comic"] },
];

const GROUP_LABEL: Record<WidgetPaletteItem["group"], string> = {
  text: "Text",
  media: "Media",
  shape: "Shapes",
  layout: "Layout",
  data: "Data",
  comic: "Comic",
};

export interface WidgetPaletteProps {
  onInsert: (kind: WidgetKind) => void;
  /** Insert a linked-content widget bound to a specific user-owned
   *  entity. Receives `(entityKind, entityId)` so the parent can build
   *  the widget via `makeLinkedContentWidget()` and append it to the
   *  active scene. */
  onInsertLinkedContent: (entityKind: LinkedContentKind, entityId: string) => void;
  /** Fire the shared screenshot Control (open picker → capture → upload
   *  → insert Image widget). Wired both to the Screenshot tile's click
   *  and — via the canvas drop handler — to the drop case, so capture
   *  logic lives in exactly one hook. */
  onCaptureScreenshot: () => void;
  /** Active project's mediaKind. Controls which palette groups are
   *  visible — comic-native primitives only render when the project is
   *  a comic. Optional for back-compat with callers that haven't been
   *  updated yet; absent = behave as before (show every non-mediaKind-
   *  gated tile). */
  mediaKind?: string;
}

const GROUPS: WidgetPaletteItem["group"][] = ["text", "media", "shape", "comic", "layout", "data"];

export default function WidgetPalette({
  onInsert,
  onInsertLinkedContent,
  onCaptureScreenshot,
  mediaKind,
}: WidgetPaletteProps) {
  // Same collapsible-multi-open behaviour as Design + Actions tabs so
  // all three left-rail panels feel identical. Default to all-open here
  // because widget palette items are the user's primary "add" path —
  // hiding them on first paint would be a regression.
  const sections = useCollapsibleSections(GROUPS, {
    storageKey: "studio.v2.left.widgets.sections",
  });

  return (
    <LeftPanelScroller>
      {GROUPS.map((group) => {
        // Self-gating per the DRY rule — the palette knows which tiles
        // belong on which mediaKind; consumers don't pass a `canShowX`
        // boolean. A tile with no `mediaKinds` field renders for every
        // kind; one with `mediaKinds: ["comic"]` only renders when the
        // active project is a comic.
        const items = WIDGET_CATALOG.filter(
          (i) =>
            i.group === group &&
            (!i.mediaKinds || (mediaKind !== undefined && i.mediaKinds.includes(mediaKind))),
        );
        if (items.length === 0 && group !== "media") return null;
        return (
          <LeftPanelSection
            key={group}
            title={GROUP_LABEL[group]}
            open={sections.isOpen(group)}
            onToggle={() => sections.toggle(group)}
            contentClassName="grid grid-cols-2 gap-2"
          >
            {items.map((item) => (
              <LeftPanelTile
                key={item.kind}
                label={item.label}
                icon={item.icon}
                onClick={() => onInsert(item.kind)}
                draggable
                onDragStart={(e) =>
                  writeDragPayload(e.dataTransfer, {
                    kind: "widget",
                    data: item.kind,
                  })
                }
              />
            ))}
            {group === "media" && (
              <ScreenshotTile onCapture={onCaptureScreenshot} />
            )}
          </LeftPanelSection>
        );
      })}
      <LinkedContentPaletteSection onInsert={onInsertLinkedContent} />
    </LeftPanelScroller>
  );
}

/**
 * Screenshot palette tile. Self-gates per the DRY rule: when the
 * browser doesn't expose `getDisplayMedia` (older Safari, WebView, …)
 * the tile returns null instead of forcing every parent to thread a
 * `canCaptureScreenshot` boolean through.
 *
 * Both click and drag fire the same shared Control in `useScreenshotCapture`
 * (wired by the parent into `onCapture` here and into the canvas's
 * `onScreenshotDrop` handler) — no parallel capture logic anywhere.
 */
function ScreenshotTile({ onCapture }: { onCapture: () => void }) {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.mediaDevices?.getDisplayMedia !== "function"
  ) {
    return null;
  }
  return (
    <LeftPanelTile
      label="Screenshot"
      icon={MonitorUp}
      onClick={onCapture}
      draggable
      onDragStart={(e) =>
        writeDragPayload(e.dataTransfer, { kind: "screenshot", data: "1" })
      }
      hint="Pick a window, tab, or screen and a snapshot lands on the canvas"
    />
  );
}
