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
  ChartWidgetParams,
  WebcamWidgetParams,
  ChipsWidgetParams,
  CtaWidgetParams,
  ContainerStyle,
  WidgetAnimation,
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
import { FONT_PRESETS } from "@/lib/studio/font-catalog";
import { Input } from "@/components/ui/input";
import {
  AutoSizeTextarea,
  ColorInput,
  DegreesField,
  Field,
  NumberField,
  PositionField,
  SelectField,
} from "./fields";
import SourceEditor from "./SourceEditor";
import PositionPresets from "./PositionPresets";
import EffectStackEditor from "@/components/studio/effects/EffectStackEditor";
import type { WidgetInspectorSection, WidgetSectionCtx } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Shared sections — applied to every widget kind.
// ───────────────────────────────────────────────────────────────────────────

const LAYOUT_SECTION: WidgetInspectorSection = {
  id: "layout",
  title: "Layout",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetPosition }) => (
    <div className="space-y-3">
      {/* Quick layout — same 9-slot presets v1 had on every element. */}
      <PositionPresets
        position={widget.position}
        onApply={(box) =>
          onUpdateWidgetPosition({ ...widget.position, ...box })
        }
      />
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
    </div>
  ),
};

const CONTAINER_STYLE_SECTION: WidgetInspectorSection = {
  id: "container-style",
  title: "Container style",
  render: ({ widget, onUpdateWidget }) => {
    const cs = widget.containerStyle ?? {};
    const setOne = (next: Partial<ContainerStyle>) => {
      const merged: ContainerStyle = { ...cs, ...next };
      // Drop any keys that came in as undefined so the persisted shape
      // stays minimal — no `{ borderRadius: undefined, … }` noise.
      const cleaned: ContainerStyle = {};
      if (merged.backgroundColor !== undefined) cleaned.backgroundColor = merged.backgroundColor;
      if (merged.borderColor !== undefined) cleaned.borderColor = merged.borderColor;
      if (merged.borderWidth !== undefined) cleaned.borderWidth = merged.borderWidth;
      if (merged.borderRadius !== undefined) cleaned.borderRadius = merged.borderRadius;
      if (merged.padding !== undefined) cleaned.padding = merged.padding;
      onUpdateWidget({
        containerStyle: Object.keys(cleaned).length === 0 ? undefined : cleaned,
      });
    };
    const hasStyle = Object.keys(cs).length > 0;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Bg">
            <ColorInput
              value={cs.backgroundColor ?? "#000000"}
              onChange={(backgroundColor) => setOne({ backgroundColor })}
            />
          </Field>
          <Field label="Border">
            <ColorInput
              value={cs.borderColor ?? "#7c3aed"}
              onChange={(borderColor) =>
                setOne({
                  borderColor,
                  borderWidth: cs.borderWidth ?? 2,
                })
              }
            />
          </Field>
          <Field label="Radius">
            <NumberField
              value={cs.borderRadius ?? 0}
              min={0}
              onChange={(borderRadius) => setOne({ borderRadius })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Border width">
            <NumberField
              value={cs.borderWidth ?? 0}
              min={0}
              onChange={(borderWidth) => setOne({ borderWidth })}
            />
          </Field>
          <Field label="Padding">
            <NumberField
              value={cs.padding ?? 0}
              min={0}
              onChange={(padding) => setOne({ padding })}
            />
          </Field>
        </div>
        {hasStyle && (
          <button
            type="button"
            onClick={() => onUpdateWidget({ containerStyle: undefined })}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear container styling
          </button>
        )}
      </div>
    );
  },
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
  render: ({ widget, onUpdateWidget, onUpdateWidgetParams }) => {
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
        <LoopAnimationField widget={widget} onUpdateWidgetParams={onUpdateWidgetParams} />
      </div>
    );
  },
};

/**
 * Ken-Burns loop animation picker — only renders for widget kinds that
 * carry `data.animation` (image, video). Self-gates with `return null`
 * so MOTION_SECTION stays a single shared section across every widget
 * kind without consumers needing to know which ones have a Ken-Burns
 * field (DRY — previously this control was duplicated inside both
 * IMAGE_CONTENT_SECTION and VIDEO_CONTENT_SECTION, and users imported
 * from v1 had no way to find their existing loop animation because it
 * lived under CONTENT rather than MOTION).
 */
function LoopAnimationField({
  widget,
  onUpdateWidgetParams,
}: {
  widget: WidgetSectionCtx["widget"];
  onUpdateWidgetParams: WidgetSectionCtx["onUpdateWidgetParams"];
}) {
  const p = widget.params;
  if (p.kind !== "image" && p.kind !== "video") return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Loop
      </p>
      <Field label="Ken Burns">
        <SelectField<WidgetAnimation>
          value={p.data.animation ?? "none"}
          options={ANIMATION_OPTIONS}
          onChange={(animation) => {
            // Re-narrow at write-time — the discriminated-union write
            // needs `p.kind` and `p.data` together so TS can prove the
            // payload matches one branch.
            if (p.kind === "image") {
              onUpdateWidgetParams({ kind: "image", data: { ...p.data, animation } });
            } else {
              onUpdateWidgetParams({ kind: "video", data: { ...p.data, animation } });
            }
          }}
        />
      </Field>
    </div>
  );
}

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

const EFFECTS_SECTION: WidgetInspectorSection = {
  id: "effects",
  title: "Effects",
  render: ({ widget, onUpdateWidget }) => (
    // EffectStackEditor is the shared v1+v2 effect chain editor —
    // identical UX wherever an effect stack lives (DRY). We don't
    // filter the catalog: every visual effect is fair game on a widget.
    <EffectStackEditor
      effects={widget.effects ?? []}
      onChange={(next) =>
        onUpdateWidget({
          effects: next.length === 0 ? undefined : next,
        })
      }
      compact
    />
  ),
};

const SHARED_TAIL: WidgetInspectorSection[] = [
  CONTAINER_STYLE_SECTION,
  EFFECTS_SECTION,
  MOTION_SECTION,
  TIMING_SECTION,
];

const ANIMATION_OPTIONS: ReadonlyArray<{ value: WidgetAnimation; label: string }> = [
  { value: "none",      label: "None" },
  { value: "zoom-in",   label: "Zoom in" },
  { value: "zoom-out",  label: "Zoom out" },
  { value: "pan-left",  label: "Pan left" },
  { value: "pan-right", label: "Pan right" },
];

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
          <AutoSizeTextarea
            value={data.text}
            onChange={(text) => set({ text })}
            ariaLabel={kind === "heading" ? "Heading text" : "Text content"}
          />
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
          {/* MediaPicker already covers Upload + Stock (Unsplash / Pexels
              / Pixabay) + AI generate via its three tabs — no duplicate
              search/AI button needed here. SourceEditor also surfaces v1's
              custom-banner generator for image widgets only. */}
          <SourceEditor
            accept="image"
            source={data.source}
            onChange={(source) => set({ source })}
            widgetAspect={
              widget.position.height > 0
                ? widget.position.width / widget.position.height
                : undefined
            }
          />
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

const CHART_TYPE_OPTIONS: ReadonlyArray<{ value: ChartWidgetParams["chartType"]; label: string }> = [
  { value: "bar",     label: "Bar" },
  { value: "line",    label: "Line" },
  { value: "pie",     label: "Pie" },
  { value: "scatter", label: "Scatter" },
];

const CHART_FORMAT_OPTIONS: ReadonlyArray<{
  value: NonNullable<ChartWidgetParams["format"]>;
  label: string;
}> = [
  { value: "csv",  label: "CSV" },
  { value: "tsv",  label: "TSV" },
  { value: "json", label: "JSON" },
];

const CHART_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "chart") return null;
    const data = widget.params.data;
    const set = (next: Partial<ChartWidgetParams>) =>
      onUpdateWidgetParams({ kind: "chart", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Chart type">
          <SelectField<ChartWidgetParams["chartType"]>
            value={data.chartType}
            options={CHART_TYPE_OPTIONS}
            onChange={(chartType) => set({ chartType })}
          />
        </Field>
        <Field label="Data">
          <AutoSizeTextarea
            value={data.data}
            onChange={(next) => set({ data: next })}
            minRows={6}
            placeholder={"category,value\nQ1,42\nQ2,65"}
            className="font-mono text-xs"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Format">
            <SelectField<NonNullable<ChartWidgetParams["format"]>>
              value={data.format ?? "csv"}
              options={CHART_FORMAT_OPTIONS}
              onChange={(format) => set({ format })}
            />
          </Field>
          <Field label="Title">
            <Input
              value={data.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Takeaway">
          <Input
            value={data.takeaway ?? ""}
            onChange={(e) => set({ takeaway: e.target.value })}
            placeholder="One-line insight"
          />
        </Field>
        <Field label="Series colours">
          <ChartColorsEditor
            value={data.colors ?? []}
            onChange={(colors) =>
              set({ colors: colors.length === 0 ? undefined : colors })
            }
          />
        </Field>
      </div>
    );
  },
};

function ChartColorsEditor({
  value,
  onChange,
}: {
  value: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {value.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          Falls back to the theme palette. Add colours to override per series.
        </p>
      ) : (
        value.map((color, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <ColorInput
              value={color}
              onChange={(next) => {
                const copy = value.slice();
                copy[i] = next;
                onChange(copy);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Remove
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...value, CHART_COLOR_DEFAULTS[value.length % CHART_COLOR_DEFAULTS.length]])}
        className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
      >
        + Add colour
      </button>
    </div>
  );
}

const CHART_COLOR_DEFAULTS = [
  "#7c3aed",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
];

const WEBCAM_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "webcam") return null;
    const data = widget.params.data;
    const set = (next: Partial<WebcamWidgetParams>) =>
      onUpdateWidgetParams({ kind: "webcam", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Recording URL">
          <Input
            value={data.recordingUrl ?? ""}
            placeholder="Paste recording URL, or record via Actions → Webcam"
            onChange={(e) => set({ recordingUrl: e.target.value || null })}
          />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={data.mirror ?? true}
            onChange={(e) => set({ mirror: e.target.checked })}
          />
          Mirror (selfie cam)
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={data.muted ?? false}
            onChange={(e) => set({ muted: e.target.checked })}
          />
          Muted
        </label>
      </div>
    );
  },
};

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

// "" sentinel = inherit the canvas-level default. Every preset's
// `family` is the CSS font-family stack the renderer writes into
// `style.fontFamily`, so the chip body picks up the chosen face
// without any extra plumbing.
const CHIPS_FONT_OPTIONS = [
  { value: "", label: "Default" },
  ...FONT_PRESETS.map((preset) => ({ value: preset.family, label: preset.label })),
];

const CHIPS_CONTENT_SECTION: WidgetInspectorSection = {
  id: "chips-content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "chips") return null;
    const data = widget.params.data;
    const set = (next: Partial<ChipsWidgetParams>) =>
      onUpdateWidgetParams({ kind: "chips", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Chips (one per line)">
          <AutoSizeTextarea
            value={data.chips.join("\n")}
            onChange={(next) =>
              set({
                chips: next
                  .split("\n")
                  .map((c) => c.trim())
                  .filter((c) => c.length > 0),
              })
            }
            minRows={4}
          />
        </Field>
        <Field label="Layout">
          <select
            value={data.direction}
            onChange={(e) => set({ direction: e.target.value as ChipsWidgetParams["direction"] })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="row">Row</option>
            <option value="column">Column</option>
          </select>
        </Field>
        <Field label="Chip colour">
          <ColorInput value={data.chipColor} onChange={(chipColor) => set({ chipColor })} />
        </Field>
        <Field label="Text colour">
          <ColorInput value={data.textColor} onChange={(textColor) => set({ textColor })} />
        </Field>
        <Field label="Font size (px)">
          <NumberField
            value={data.fontPx}
            min={8}
            max={96}
            onChange={(fontPx) => set({ fontPx })}
          />
        </Field>
        <Field label="Font">
          <SelectField<string>
            value={data.fontFamily ?? ""}
            options={CHIPS_FONT_OPTIONS}
            onChange={(fontFamily) =>
              set({ fontFamily: fontFamily === "" ? undefined : fontFamily })
            }
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

const CTA_CONTENT_SECTION: WidgetInspectorSection = {
  id: "cta-content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "cta") return null;
    const data = widget.params.data;
    const set = (next: Partial<CtaWidgetParams>) =>
      onUpdateWidgetParams({ kind: "cta", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Headline">
          <Input value={data.headline} onChange={(e) => set({ headline: e.target.value })} />
        </Field>
        <Field label="Subheadline">
          <Input
            value={data.subheadline ?? ""}
            onChange={(e) => set({ subheadline: e.target.value || undefined })}
          />
        </Field>
        <Field label="Button text">
          <Input value={data.ctaText} onChange={(e) => set({ ctaText: e.target.value })} />
        </Field>
        <Field label="Button URL">
          <Input
            value={data.ctaUrl}
            placeholder="https://…"
            onChange={(e) => set({ ctaUrl: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Card bg">
            <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
          </Field>
          <Field label="Text">
            <ColorInput value={data.textColor} onChange={(textColor) => set({ textColor })} />
          </Field>
          <Field label="Button bg">
            <ColorInput
              value={data.accentColor}
              onChange={(accentColor) => set({ accentColor })}
            />
          </Field>
          <Field label="Button text">
            <ColorInput
              value={data.accentTextColor}
              onChange={(accentTextColor) => set({ accentTextColor })}
            />
          </Field>
        </div>
      </div>
    );
  },
};

export const WIDGET_INSPECTOR: Record<WidgetKind, WidgetInspectorSection[]> = {
  text: [LAYOUT_SECTION, textContentSection("text"), ...SHARED_TAIL],
  heading: [LAYOUT_SECTION, textContentSection("heading"), ...SHARED_TAIL],
  image: [LAYOUT_SECTION, IMAGE_CONTENT_SECTION, ...SHARED_TAIL],
  video: [LAYOUT_SECTION, VIDEO_CONTENT_SECTION, ...SHARED_TAIL],
  "shape-rect": [LAYOUT_SECTION, shapeContentSection("shape-rect"), ...SHARED_TAIL],
  "shape-circle": [LAYOUT_SECTION, shapeContentSection("shape-circle"), ...SHARED_TAIL],
  divider: [LAYOUT_SECTION, DIVIDER_CONTENT_SECTION, ...SHARED_TAIL],
  chart: [LAYOUT_SECTION, CHART_CONTENT_SECTION, ...SHARED_TAIL],
  webcam: [LAYOUT_SECTION, WEBCAM_CONTENT_SECTION, ...SHARED_TAIL],
  chips: [LAYOUT_SECTION, CHIPS_CONTENT_SECTION, ...SHARED_TAIL],
  cta: [LAYOUT_SECTION, CTA_CONTENT_SECTION, ...SHARED_TAIL],
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
  chart: "Chart",
  webcam: "Webcam",
  chips: "Chips",
  cta: "CTA card",
};
