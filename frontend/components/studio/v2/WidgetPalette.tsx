/**
 * Widget palette — the draggable inventory of canvas elements rendered
 * below the scenes rail. Items are dragged onto the canvas via HTML5
 * dataTransfer (handled by `<CanvasStage onWidgetDrop>`). Click also
 * inserts the widget at a default position.
 *
 * `WIDGET_CATALOG` is the single source of widget metadata (kind →
 * icon + label) — also read by `LayersPanel` to look up per-widget
 * icons, so media kinds (image / video / webcam) stay in the catalog
 * even though their tiles render from the shared `MediaSection` rather
 * than from the catalog-driven loop here.
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
  Tags,
  Megaphone,
  MessageCircle,
  Captions,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetKind, VoiceoverClip } from "@/lib/studio/editor-v2/canvas-state";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import LinkedContentPaletteSection from "./LinkedContentPaletteSection";
import MediaSection from "./MediaSection";
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
  // Media-group entries stay in the catalog so `LayersPanel` can look
  // up icons for image / video / webcam widgets by kind. The tiles
  // themselves now render from `MediaSection` (shared with ActionsPanel).
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

type CatalogGroup = Exclude<WidgetPaletteItem["group"], "media">;

const GROUP_LABEL: Record<CatalogGroup, string> = {
  text: "Text",
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
  /** Picker / bin handlers — threaded into the shared `MediaSection` so
   *  the Widgets-tab mount has feature parity with the Actions-tab
   *  mount (Upload / Stock / AI, plus the embedded source bin). */
  onAddImageWidget: (url: string) => void;
  onAddVideoWidget: (url: string, durationSeconds: number) => void;
  onAddVoiceover: (clip: VoiceoverClip) => void;
  /** Scene a new voiceover anchors to (bin → audio source path). */
  activeSceneId: string;
  /** Active project's mediaKind. Controls which palette groups are
   *  visible — comic-native primitives only render when the project is
   *  a comic. Optional for back-compat with callers that haven't been
   *  updated yet; absent = behave as before (show every non-mediaKind-
   *  gated tile). */
  mediaKind?: string;
}

const PRE_MEDIA_GROUPS: readonly CatalogGroup[] = ["text"];
const POST_MEDIA_GROUPS: readonly CatalogGroup[] = ["shape", "comic", "layout", "data"];
// Section ids used by the collapsible-state hook. "media" lives next to
// the catalog groups so the user's open/closed preference for the Media
// section persists across reloads alongside the others.
const SECTION_IDS = [...PRE_MEDIA_GROUPS, "media" as const, ...POST_MEDIA_GROUPS];

export default function WidgetPalette({
  onInsert,
  onInsertLinkedContent,
  onCaptureScreenshot,
  onAddImageWidget,
  onAddVideoWidget,
  onAddVoiceover,
  activeSceneId,
  mediaKind,
}: WidgetPaletteProps) {
  // Same collapsible-multi-open behaviour as Design + Actions tabs so
  // all three left-rail panels feel identical. Default to all-open here
  // because widget palette items are the user's primary "add" path —
  // hiding them on first paint would be a regression.
  const sections = useCollapsibleSections(SECTION_IDS, {
    storageKey: "studio.v2.left.widgets.sections",
  });

  const renderCatalogGroup = (group: CatalogGroup) => {
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
    if (items.length === 0) return null;
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
      </LeftPanelSection>
    );
  };

  return (
    <LeftPanelScroller>
      {PRE_MEDIA_GROUPS.map(renderCatalogGroup)}
      <MediaSection
        open={sections.isOpen("media")}
        onToggle={() => sections.toggle("media")}
        onInsertImage={() => onInsert("image")}
        onInsertVideo={() => onInsert("video")}
        onInsertWebcam={() => onInsert("webcam")}
        onCaptureScreenshot={onCaptureScreenshot}
        onAddImageWidget={onAddImageWidget}
        onAddVideoWidget={onAddVideoWidget}
        onAddVoiceover={onAddVoiceover}
        activeSceneId={activeSceneId}
      />
      {POST_MEDIA_GROUPS.map(renderCatalogGroup)}
      <LinkedContentPaletteSection onInsert={onInsertLinkedContent} />
    </LeftPanelScroller>
  );
}
