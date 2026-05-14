/**
 * Per-widget-kind inspector section registry. Each widget kind declares
 * the sections that show up in the right panel when it's selected.
 * Adding a new widget kind is one entry in `WIDGET_INSPECTOR`; the
 * panel picks it up with no PropertiesPanel edits.
 *
 * Shared sections (Layout, Motion, Timing) apply to every widget and
 * live in `SHARED_TAIL`. Kind-specific Content sections come first so
 * the user lands on the field they're most likely to edit (text body,
 * source URL, fill colour).
 */
import type {
  TextWidgetParams,
  ImageWidgetParams,
  VideoWidgetParams,
  ShapeWidgetParams,
  DividerWidgetParams,
  WidgetKind,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  MOTION_KINDS,
  MOTION_KIND_LABELS,
  MOTION_EASINGS,
  MOTION_EASING_LABELS,
  defaultMotion,
  type MotionEasing,
  type MotionKind,
  type WidgetMotion,
} from "@/lib/studio/editor-v2/widget-motion";
import { Input } from "@/components/ui/input";
import {
  ColorInput,
  DegreesField,
  Field,
  NumberField,
  PositionField,
  SelectField,
} from "./fields";
import SourceEditor from "./SourceEditor";
import type { WidgetInspectorSection, WidgetSectionCtx } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Shared sections — applied to every widget kind.
// ───────────────────────────────────────────────────────────────────────────

const LAYOUT_SECTION: WidgetInspectorSection = {
  id: "layout",
  title: "Layout",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetPosition }) => (
    <div className="grid grid-cols-2 gap-2">
      <PositionField
        label="X"
        value={widget.position.x}
        onChange={(x) => onUpdateWidgetPosition({ ...widget.position, x })}
      />
      <PositionField
        label="Y"
        value={widget.position.y}
        onChange={(y) => onUpdateWidgetPosition({ ...widget.position, y })}
      />
      <PositionField
        label="Width"
        value={widget.position.width}
        onChange={(width) => onUpdateWidgetPosition({ ...widget.position, width })}
      />
      <PositionField
        label="Height"
        value={widget.position.height}
        onChange={(height) => onUpdateWidgetPosition({ ...widget.position, height })}
      />
      <DegreesField
        label="Rotation"
        value={widget.position.rotation}
        onChange={(rotation) => onUpdateWidgetPosition({ ...widget.position, rotation })}
      />
    </div>
  ),
};

const MOTION_KIND_OPTIONS = MOTION_KINDS.map((k) => ({
  value: k,
  label: MOTION_KIND_LABELS[k],
}));
const MOTION_EASING_OPTIONS = MOTION_EASINGS.map((e) => ({
  value: e,
  label: MOTION_EASING_LABELS[e],
}));

const MOTION_SECTION: WidgetInspectorSection = {
  id: "motion",
  title: "Motion",
  render: ({ widget, onUpdateWidget }) => {
    const motion = widget.motion ?? defaultMotion();
    function patch(next: Partial<WidgetMotion>) {
      onUpdateWidget({ motion: { ...motion, ...next } });
    }
    function patchPhase(phase: "enter" | "exit", next: Partial<WidgetMotion["enter"]>) {
      patch({ [phase]: { ...motion[phase], ...next } } as Partial<WidgetMotion>);
    }
    return (
      <div className="space-y-4">
        <PhaseEditor
          title="Enter"
          phase={motion.enter}
          onChangeKind={(kind: MotionKind) => patchPhase("enter", { kind })}
          onChangeDuration={(durationSeconds) => patchPhase("enter", { durationSeconds })}
          onChangeEasing={(easing: MotionEasing) => patchPhase("enter", { easing })}
        />
        <PhaseEditor
          title="Exit"
          phase={motion.exit}
          onChangeKind={(kind: MotionKind) => patchPhase("exit", { kind })}
          onChangeDuration={(durationSeconds) => patchPhase("exit", { durationSeconds })}
          onChangeEasing={(easing: MotionEasing) => patchPhase("exit", { easing })}
        />
      </div>
    );
  },
};

function PhaseEditor({
  title,
  phase,
  onChangeKind,
  onChangeDuration,
  onChangeEasing,
}: {
  title: string;
  phase: WidgetMotion["enter"];
  onChangeKind: (kind: MotionKind) => void;
  onChangeDuration: (seconds: number) => void;
  onChangeEasing: (easing: MotionEasing) => void;
}) {
  const disabled = phase.kind === "none";
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <Field label="Animation">
        <SelectField<MotionKind>
          value={phase.kind}
          options={MOTION_KIND_OPTIONS}
          onChange={onChangeKind}
        />
      </Field>
      {!disabled && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Duration (s)">
            <NumberField
              value={Number(phase.durationSeconds.toFixed(2))}
              min={0}
              step={0.05}
              onChange={onChangeDuration}
            />
          </Field>
          <Field label="Easing">
            <SelectField<MotionEasing>
              value={phase.easing}
              options={MOTION_EASING_OPTIONS}
              onChange={onChangeEasing}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

const TIMING_SECTION: WidgetInspectorSection = {
  id: "timing",
  title: "Timing",
  render: ({ widget, scene, onUpdateWidget }) => {
    const from = widget.visibleFrom;
    const to = widget.visibleTo;
    return (
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">
          Constrain when this widget shows within the {scene.durationSeconds.toFixed(1)}s scene.
          Leave blank for the whole scene.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From (s)">
            <Input
              type="number"
              min={0}
              max={scene.durationSeconds}
              step={0.1}
              value={from ?? ""}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                onUpdateWidget({
                  visibleFrom: raw === "" ? null : Math.max(0, Number(raw) || 0),
                });
              }}
            />
          </Field>
          <Field label="To (s)">
            <Input
              type="number"
              min={0}
              max={scene.durationSeconds}
              step={0.1}
              value={to ?? ""}
              placeholder={scene.durationSeconds.toFixed(1)}
              onChange={(e) => {
                const raw = e.target.value;
                onUpdateWidget({
                  visibleTo:
                    raw === ""
                      ? null
                      : Math.min(scene.durationSeconds, Math.max(0, Number(raw) || 0)),
                });
              }}
            />
          </Field>
        </div>
      </div>
    );
  },
};

const SHARED_TAIL: WidgetInspectorSection[] = [MOTION_SECTION, TIMING_SECTION];

// ───────────────────────────────────────────────────────────────────────────
// Per-kind Content sections.
// ───────────────────────────────────────────────────────────────────────────

const ALIGN_OPTIONS = [
  { value: "left" as const, label: "Left" },
  { value: "center" as const, label: "Centre" },
  { value: "right" as const, label: "Right" },
];

const FONT_WEIGHT_OPTIONS = [
  { value: "normal" as const, label: "Regular" },
  { value: "bold" as const, label: "Bold" },
];

function textContentSection(kind: "text" | "heading"): WidgetInspectorSection {
  return {
    id: "content",
    title: "Content",
    defaultOpen: true,
    render: ({ widget, onUpdateWidgetParams }) => {
      if (widget.params.kind !== kind) return null;
      const data = widget.params.data;
      const set = (next: Partial<TextWidgetParams>) =>
        onUpdateWidgetParams({ kind, data: { ...data, ...next } });
      return (
        <div className="space-y-3">
          <Field label="Text">
            <Input value={data.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font size (px)">
              <NumberField
                value={data.fontPx}
                min={8}
                onChange={(fontPx) => set({ fontPx })}
              />
            </Field>
            <Field label="Weight">
              <SelectField<"normal" | "bold">
                value={data.fontWeight}
                options={FONT_WEIGHT_OPTIONS}
                onChange={(fontWeight) => set({ fontWeight })}
              />
            </Field>
          </div>
          <Field label="Colour">
            <ColorInput value={data.color} onChange={(color) => set({ color })} />
          </Field>
          <Field label="Alignment">
            <SelectField<"left" | "center" | "right">
              value={data.align}
              options={ALIGN_OPTIONS}
              onChange={(align) => set({ align })}
            />
          </Field>
          <Field label="Background">
            <ColorInput
              value={data.background ?? "#000000"}
              onChange={(background) => set({ background })}
            />
            {data.background !== null && (
              <button
                type="button"
                className="mt-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => set({ background: null })}
              >
                Remove background
              </button>
            )}
          </Field>
        </div>
      );
    },
  };
}

const IMAGE_FIT_OPTIONS = [
  { value: "cover" as const, label: "Cover" },
  { value: "contain" as const, label: "Contain" },
  { value: "stretch" as const, label: "Stretch" },
];

const IMAGE_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "image") return null;
    const data = widget.params.data;
    const set = (next: Partial<ImageWidgetParams>) =>
      onUpdateWidgetParams({ kind: "image", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Source">
          <SourceEditor accept="image" source={data.source} onChange={(source) => set({ source })} />
        </Field>
        <Field label="Fit">
          <SelectField<"cover" | "contain" | "stretch">
            value={data.fit}
            options={IMAGE_FIT_OPTIONS}
            onChange={(fit) => set({ fit })}
          />
        </Field>
      </div>
    );
  },
};

const VIDEO_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "video") return null;
    const data = widget.params.data;
    const set = (next: Partial<VideoWidgetParams>) =>
      onUpdateWidgetParams({ kind: "video", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Source">
          <SourceEditor accept="video" source={data.source} onChange={(source) => set({ source })} />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={data.muted}
            onChange={(e) => set({ muted: e.target.checked })}
          />
          Muted
        </label>
      </div>
    );
  },
};

function shapeContentSection(kind: "shape-rect" | "shape-circle"): WidgetInspectorSection {
  return {
    id: "content",
    title: "Content",
    defaultOpen: true,
    render: ({ widget, onUpdateWidgetParams }) => {
      if (widget.params.kind !== kind) return null;
      const data = widget.params.data;
      const set = (next: Partial<ShapeWidgetParams>) =>
        onUpdateWidgetParams({ kind, data: { ...data, ...next } });
      return (
        <div className="space-y-3">
          <Field label="Fill">
            <ColorInput value={data.fill} onChange={(fill) => set({ fill })} />
          </Field>
          <Field label="Stroke colour">
            <ColorInput
              value={data.strokeColor}
              onChange={(strokeColor) => set({ strokeColor })}
            />
          </Field>
          <Field label="Stroke width">
            <NumberField
              value={data.strokeWidth}
              min={0}
              onChange={(strokeWidth) => set({ strokeWidth })}
            />
          </Field>
          {kind === "shape-rect" && (
            <Field label="Corner radius">
              <NumberField
                value={data.cornerRadius}
                min={0}
                onChange={(cornerRadius) => set({ cornerRadius })}
              />
            </Field>
          )}
        </div>
      );
    },
  };
}

const DIVIDER_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "divider") return null;
    const data = widget.params.data;
    const set = (next: Partial<DividerWidgetParams>) =>
      onUpdateWidgetParams({ kind: "divider", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Colour">
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Thickness">
          <NumberField
            value={data.thickness}
            min={1}
            onChange={(thickness) => set({ thickness })}
          />
        </Field>
      </div>
    );
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Registry — one entry per WidgetKind. The right panel reads this map
// directly so adding a kind is one row here + one row in `WIDGET_CATALOG`.
// ───────────────────────────────────────────────────────────────────────────

export const WIDGET_INSPECTOR: Record<WidgetKind, WidgetInspectorSection[]> = {
  text: [LAYOUT_SECTION, textContentSection("text"), ...SHARED_TAIL],
  heading: [LAYOUT_SECTION, textContentSection("heading"), ...SHARED_TAIL],
  image: [LAYOUT_SECTION, IMAGE_CONTENT_SECTION, ...SHARED_TAIL],
  video: [LAYOUT_SECTION, VIDEO_CONTENT_SECTION, ...SHARED_TAIL],
  "shape-rect": [LAYOUT_SECTION, shapeContentSection("shape-rect"), ...SHARED_TAIL],
  "shape-circle": [LAYOUT_SECTION, shapeContentSection("shape-circle"), ...SHARED_TAIL],
  divider: [LAYOUT_SECTION, DIVIDER_CONTENT_SECTION, ...SHARED_TAIL],
};

export function getWidgetSections(ctx: WidgetSectionCtx): WidgetInspectorSection[] {
  return WIDGET_INSPECTOR[ctx.widget.kind];
}

export const WIDGET_TITLES: Record<WidgetKind, string> = {
  text: "Text",
  heading: "Heading",
  image: "Image",
  video: "Video",
  "shape-rect": "Rectangle",
  "shape-circle": "Circle",
  divider: "Divider",
};
