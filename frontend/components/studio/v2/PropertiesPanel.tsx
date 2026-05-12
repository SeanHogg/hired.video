/**
 * Right-hand properties panel — context-switches between scene settings
 * (when the canvas frame is selected) and widget configuration (when a
 * widget is selected).
 *
 * Self-gating per DRY: receives the selection + the canvas-state-mutator
 * callbacks from the editor shell. Doesn't compute "can edit" — the
 * shell owns persistence and authorization upstream.
 */
import {
  findScene,
  findWidget,
  type CanvasState,
  type Scene,
  type Widget,
  type WidgetParams,
  type WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import type { Selection } from "./CanvasStage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export interface PropertiesPanelProps {
  state: CanvasState;
  selection: Selection;
  onUpdateScene: (sceneId: string, patch: Partial<Scene>) => void;
  onUpdateWidgetPosition: (widgetId: string, position: WidgetPosition) => void;
  onUpdateWidgetParams: (widgetId: string, params: WidgetParams) => void;
  onDeleteWidget: (widgetId: string) => void;
}

export default function PropertiesPanel(props: PropertiesPanelProps) {
  const { state, selection } = props;

  if (selection.kind === "widget") {
    const result = findWidget(state, selection.widgetId);
    if (!result) return <Empty />;
    return <WidgetProperties widget={result.widget} {...props} />;
  }

  const scene = findScene(state, selection.sceneId);
  if (!scene) return <Empty />;
  return <SceneProperties scene={scene} {...props} />;
}

function Empty() {
  return (
    <div className="p-4 text-xs text-muted-foreground">
      Click a widget or empty area of the canvas to edit its settings.
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Scene properties
// ───────────────────────────────────────────────────────────────────────────

function SceneProperties({
  scene,
  onUpdateScene,
}: { scene: Scene } & PropertiesPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <Header title={scene.label} subtitle="Scene" />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Label">
          <Input
            value={scene.label}
            onChange={(e) => onUpdateScene(scene.id, { label: e.target.value })}
          />
        </Field>
        <Field label="Duration (seconds)">
          <Input
            type="number"
            min={0.1}
            step={0.1}
            value={scene.durationSeconds}
            onChange={(e) =>
              onUpdateScene(scene.id, {
                durationSeconds: Math.max(0.1, Number(e.target.value) || 0),
              })
            }
          />
        </Field>
        <Field label="Background colour">
          <ColorInput
            value={scene.backgroundColor}
            onChange={(color) => onUpdateScene(scene.id, { backgroundColor: color })}
          />
        </Field>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Widget properties — dispatches by widget kind so the panel layout
// stays a single React tree with no per-kind branches at the consumer
// boundary.
// ───────────────────────────────────────────────────────────────────────────

function WidgetProperties({
  widget,
  onUpdateWidgetPosition,
  onUpdateWidgetParams,
  onDeleteWidget,
}: { widget: Widget } & PropertiesPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <Header
        title={widgetTitle(widget)}
        subtitle="Widget"
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteWidget(widget.id)}
            className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Section title="Layout">
          <div className="grid grid-cols-2 gap-2">
            <PositionField
              label="X"
              value={widget.position.x}
              onChange={(x) => onUpdateWidgetPosition(widget.id, { ...widget.position, x })}
            />
            <PositionField
              label="Y"
              value={widget.position.y}
              onChange={(y) => onUpdateWidgetPosition(widget.id, { ...widget.position, y })}
            />
            <PositionField
              label="Width"
              value={widget.position.width}
              onChange={(width) =>
                onUpdateWidgetPosition(widget.id, { ...widget.position, width })
              }
            />
            <PositionField
              label="Height"
              value={widget.position.height}
              onChange={(height) =>
                onUpdateWidgetPosition(widget.id, { ...widget.position, height })
              }
            />
          </div>
        </Section>
        <Section title="Content">
          <WidgetContentEditor
            widget={widget}
            onChange={(params) => onUpdateWidgetParams(widget.id, params)}
          />
        </Section>
      </div>
    </div>
  );
}

function widgetTitle(widget: Widget): string {
  switch (widget.params.kind) {
    case "heading":
      return "Heading";
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "shape-rect":
      return "Rectangle";
    case "shape-circle":
      return "Circle";
    case "divider":
      return "Divider";
  }
}

interface ContentEditorProps {
  widget: Widget;
  onChange: (params: WidgetParams) => void;
}

function WidgetContentEditor({ widget, onChange }: ContentEditorProps) {
  const p = widget.params;
  switch (p.kind) {
    case "text":
    case "heading":
      return (
        <div className="space-y-3">
          <Field label="Text">
            <Input
              value={p.data.text}
              onChange={(e) =>
                onChange({ kind: p.kind, data: { ...p.data, text: e.target.value } })
              }
            />
          </Field>
          <Field label="Font size (px)">
            <Input
              type="number"
              min={8}
              value={p.data.fontPx}
              onChange={(e) =>
                onChange({
                  kind: p.kind,
                  data: { ...p.data, fontPx: Math.max(8, Number(e.target.value) || 0) },
                })
              }
            />
          </Field>
          <Field label="Colour">
            <ColorInput
              value={p.data.color}
              onChange={(color) => onChange({ kind: p.kind, data: { ...p.data, color } })}
            />
          </Field>
          <Field label="Alignment">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={p.data.align}
              onChange={(e) =>
                onChange({
                  kind: p.kind,
                  data: {
                    ...p.data,
                    align: e.target.value as "left" | "center" | "right",
                  },
                })
              }
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </Field>
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          <Field label="Image URL">
            <Input
              value={p.data.source.kind === "url" ? p.data.source.url : ""}
              placeholder="https://..."
              onChange={(e) =>
                onChange({
                  kind: "image",
                  data: {
                    ...p.data,
                    source: { kind: "url", url: e.target.value },
                  },
                })
              }
            />
          </Field>
          <Field label="Fit">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={p.data.fit}
              onChange={(e) =>
                onChange({
                  kind: "image",
                  data: {
                    ...p.data,
                    fit: e.target.value as "cover" | "contain" | "stretch",
                  },
                })
              }
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </Field>
        </div>
      );
    case "video":
      return (
        <div className="space-y-3">
          <Field label="Video URL">
            <Input
              value={p.data.source.kind === "url" ? p.data.source.url : ""}
              placeholder="https://..."
              onChange={(e) =>
                onChange({
                  kind: "video",
                  data: { ...p.data, source: { kind: "url", url: e.target.value } },
                })
              }
            />
          </Field>
          <Field label="Muted">
            <input
              type="checkbox"
              checked={p.data.muted}
              onChange={(e) =>
                onChange({ kind: "video", data: { ...p.data, muted: e.target.checked } })
              }
            />
          </Field>
        </div>
      );
    case "shape-rect":
    case "shape-circle":
      return (
        <div className="space-y-3">
          <Field label="Fill">
            <ColorInput
              value={p.data.fill}
              onChange={(fill) => onChange({ kind: p.kind, data: { ...p.data, fill } })}
            />
          </Field>
          <Field label="Stroke colour">
            <ColorInput
              value={p.data.strokeColor}
              onChange={(strokeColor) =>
                onChange({ kind: p.kind, data: { ...p.data, strokeColor } })
              }
            />
          </Field>
          <Field label="Stroke width">
            <Input
              type="number"
              min={0}
              value={p.data.strokeWidth}
              onChange={(e) =>
                onChange({
                  kind: p.kind,
                  data: {
                    ...p.data,
                    strokeWidth: Math.max(0, Number(e.target.value) || 0),
                  },
                })
              }
            />
          </Field>
          {p.kind === "shape-rect" && (
            <Field label="Corner radius">
              <Input
                type="number"
                min={0}
                value={p.data.cornerRadius}
                onChange={(e) =>
                  onChange({
                    kind: "shape-rect",
                    data: {
                      ...p.data,
                      cornerRadius: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            </Field>
          )}
        </div>
      );
    case "divider":
      return (
        <div className="space-y-3">
          <Field label="Colour">
            <ColorInput
              value={p.data.color}
              onChange={(color) => onChange({ kind: "divider", data: { ...p.data, color } })}
            />
          </Field>
          <Field label="Thickness">
            <Input
              type="number"
              min={1}
              value={p.data.thickness}
              onChange={(e) =>
                onChange({
                  kind: "divider",
                  data: { ...p.data, thickness: Math.max(1, Number(e.target.value) || 0) },
                })
              }
            />
          </Field>
        </div>
      );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Layout primitives — shared by both panels so spacing/typography don't
// drift across consumer code.
// ───────────────────────────────────────────────────────────────────────────

function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {subtitle}
        </p>
        <p className="text-sm font-medium leading-tight">{title}</p>
      </div>
      {action}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function PositionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={0.01}
        min={0}
        max={1}
        value={Number(value.toFixed(3))}
        onChange={(e) => onChange(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
    </div>
  );
}
