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
  ImageIcon,
  Video as VideoIcon,
  Square,
  Circle,
  Minus,
} from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";

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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Widgets
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group) => {
          const items = WIDGET_CATALOG.filter((i) => i.group === group);
          return (
            <div key={group} className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {GROUP_LABEL[group]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(WIDGET_DRAG_MIME, item.kind);
                      }}
                      onClick={() => onInsert(item.kind)}
                      className="flex flex-col items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-3 text-xs font-medium transition hover:border-brand-purple hover:bg-muted/40"
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
