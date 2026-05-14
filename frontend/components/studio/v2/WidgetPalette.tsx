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
} from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";

export interface WidgetPaletteItem {
  kind: WidgetKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: "text" | "media" | "shape" | "layout";
}

export const WIDGET_CATALOG: WidgetPaletteItem[] = [
  { kind: "heading", label: "Heading", icon: Heading1, group: "text" },
  { kind: "text", label: "Text", icon: Type, group: "text" },
  { kind: "image", label: "Image", icon: ImageIcon, group: "media" },
  { kind: "video", label: "Video", icon: VideoIcon, group: "media" },
  { kind: "shape-rect", label: "Rectangle", icon: Square, group: "shape" },
  { kind: "shape-circle", label: "Circle", icon: Circle, group: "shape" },
  { kind: "divider", label: "Divider", icon: Minus, group: "layout" },
];

const GROUP_LABEL: Record<WidgetPaletteItem["group"], string> = {
  text: "Text",
  media: "Media",
  shape: "Shapes",
  layout: "Layout",
};

export const WIDGET_DRAG_MIME = "application/x-studio-widget-kind";

export interface WidgetPaletteProps {
  onInsert: (kind: WidgetKind) => void;
}

export default function WidgetPalette({ onInsert }: WidgetPaletteProps) {
  const groups: WidgetPaletteItem["group"][] = ["text", "media", "shape", "layout"];

  // Tab label ("WIDGETS") is rendered by the LeftTabs component — no
  // need for a duplicate header here. Sections share the LeftPanelSection
  // chrome used by Design + Actions so the three tabs are pixel-identical.
  return (
    <LeftPanelScroller>
      {groups.map((group) => {
        const items = WIDGET_CATALOG.filter((i) => i.group === group);
        return (
          <LeftPanelSection
            key={group}
            title={GROUP_LABEL[group]}
            contentClassName="grid grid-cols-2 gap-2"
          >
            {items.map((item) => (
              <LeftPanelTile
                key={item.kind}
                label={item.label}
                icon={item.icon}
                onClick={() => onInsert(item.kind)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData(WIDGET_DRAG_MIME, item.kind);
                }}
              />
            ))}
          </LeftPanelSection>
        );
      })}
    </LeftPanelScroller>
  );
}
