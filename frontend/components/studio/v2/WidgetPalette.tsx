/**
 * Widget palette — the draggable inventory of canvas elements rendered
 * below the scenes rail. Items are dragged onto the canvas via HTML5
 * dataTransfer (handled by `<CanvasStage onWidgetDrop>`). Click also
 * inserts the widget at a default position.
 *
 * `WIDGET_CATALOG` (lib/studio/editor-v2/widget-catalog) is the single
 * source of widget metadata (kind → icon + label) — also read by
 * `LayersPanel` to look up per-widget
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
import type { WidgetKind, AudioLayer } from "@/lib/studio/editor-v2/canvas-state";
import { WIDGET_CATALOG, isCatalogItemAvailable, type WidgetPaletteItem } from "@/lib/studio/editor-v2/widget-catalog";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import LinkedContentPaletteSection from "./LinkedContentPaletteSection";
import MediaSection from "./MediaSection";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";

type CatalogGroup = Exclude<WidgetPaletteItem["group"], "media">;

const GROUP_LABEL: Record<CatalogGroup, string> = {
  text: "Text",
  shape: "Shapes",
  layout: "Layout",
  data: "Data",
  comic: "Comic",
  ai: "AI",
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
  /** Omit on a host that can't hold free audio layers (MediaSection then
   *  hides its audio controls). */
  onAddVoiceover?: (layer: AudioLayer) => void;
  /** Scene a new voiceover anchors to (bin → audio source path). */
  activeSceneId: string;
  /** Active project's mediaKind. Controls which palette groups are
   *  visible — comic-native primitives only render when the project is
   *  a comic. Optional for back-compat with callers that haven't been
   *  updated yet; absent = behave as before (show every non-mediaKind-
   *  gated tile). */
  mediaKind?: string;
  /** Which half to render: the editor's left panel splits the palette into a
   *  Widgets tab (catalog + linked content) and a Media tab (the shared
   *  MediaSection: upload / stock / AI / source bin / "Add audio as").
   *  Default "all" keeps the combined palette. */
  section?: "all" | "widgets" | "media";
}

const PRE_MEDIA_GROUPS: readonly CatalogGroup[] = ["text"];
const POST_MEDIA_GROUPS: readonly CatalogGroup[] = ["ai", "shape", "comic", "layout", "data"];
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
  section = "all",
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
      (i) => i.group === group && isCatalogItemAvailable(i, mediaKind),
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

  const showWidgets = section !== "media";
  const showMedia = section !== "widgets";
  return (
    <LeftPanelScroller>
      {showWidgets && PRE_MEDIA_GROUPS.map(renderCatalogGroup)}
      {showMedia && (
        <MediaSection
          open={section === "media" || sections.isOpen("media")}
          onToggle={() => sections.toggle("media")}
          onInsertImage={() => onInsert("image")}
          onInsertVideo={() => onInsert("video")}
          onInsertWebcam={() => onInsert("webcam")}
          onCaptureScreenshot={onCaptureScreenshot}
          onAddImageWidget={onAddImageWidget}
          onAddVideoWidget={onAddVideoWidget}
          onAddAudioLayer={onAddVoiceover}
          activeSceneId={activeSceneId}
        />
      )}
      {showWidgets && POST_MEDIA_GROUPS.map(renderCatalogGroup)}
      {showWidgets && <LinkedContentPaletteSection onInsert={onInsertLinkedContent} />}
    </LeftPanelScroller>
  );
}
