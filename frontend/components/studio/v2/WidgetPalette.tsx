/**
 * Widget palette — the draggable inventory of canvas elements rendered
 * below the scenes rail. Items are dragged onto the canvas via HTML5
 * dataTransfer (handled by `<CanvasStage onWidgetDrop>`). Click also
 * inserts the widget at a default position.
 *
 * The palette is the SINGLE source of widget metadata. The catalog
 * below is read by ToolPalette here AND by tests that assert every
 * `WidgetKind` has palette coverage.
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
} from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";

export interface WidgetPaletteItem {
  kind: WidgetKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: "text" | "media" | "shape" | "layout" | "data";
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
];

const GROUP_LABEL: Record<WidgetPaletteItem["group"], string> = {
  text: "Text",
  media: "Media",
  shape: "Shapes",
  layout: "Layout",
  data: "Data",
};

export interface WidgetPaletteProps {
  onInsert: (kind: WidgetKind) => void;
}

const GROUPS: WidgetPaletteItem["group"][] = ["text", "media", "shape", "layout", "data"];

export default function WidgetPalette({ onInsert }: WidgetPaletteProps) {
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
        const items = WIDGET_CATALOG.filter((i) => i.group === group);
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
      })}
    </LeftPanelScroller>
  );
}
