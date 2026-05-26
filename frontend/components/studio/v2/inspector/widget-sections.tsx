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
import { lazy, Suspense, useEffect, useState } from "react";
import { Camera } from "lucide-react";
import type {
  TextWidgetParams,
  ImageWidgetParams,
  VideoWidgetParams,
  ChromaKeyParams,
  ShapeWidgetParams,
  DividerWidgetParams,
  ChartWidgetParams,
  WebcamWidgetParams,
  ChipsWidgetParams,
  CtaWidgetParams,
  LinkedContentWidgetParams,
  ContainerStyle,
  WidgetKind,
  SpeechBubbleWidgetParams,
  CaptionBoxWidgetParams,
  SfxBurstWidgetParams,
} from "@/lib/studio/editor-v2/canvas-state";
import { DEFAULT_CHROMA_KEY } from "@/lib/studio/chroma-key";
import {
  LINKED_CONTENT_REGISTRY,
  type LinkedContentKind,
  type LinkedContentSummary,
} from "@/lib/studio/editor-v2/linked-content";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import ContentLinkPicker from "@/components/studio/shared/ContentLinkPicker";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import type { WidgetInspectorSection, WidgetSectionCtx } from "./types";

// Lazy — keeps MediaRecorder + getUserMedia (and the upload helper) off
// the editor's initial bundle. The wrapper owns the upload + fallback
// toast so the inspector and ActionsPanel share one recorder pipeline.
const WebcamRecorderWithUpload = lazy(
  () => import("@/components/studio/WebcamRecorderWithUpload"),
);

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
  defaultOpen: true,
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
        <Field label="Alt text (for screen readers)">
          <input
            type="text"
            value={data.altText ?? ""}
            placeholder="What does this image convey? (1 short sentence)"
            onChange={(e) => set({ altText: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
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

/** Chroma-key (green-screen) controls. Self-gates by widget kind so
 *  the dispatch in the WIDGET_INSPECTOR registry doesn't have to
 *  branch — the section renders for video widgets and returns null
 *  otherwise. Persists `chromaKey: null` rather than removing the
 *  field so the user's last-used colour survives a toggle off/on
 *  cycle (a single React state slice across the editor doesn't help
 *  here; this is committed canvas state). */
const VIDEO_CHROMA_SECTION: WidgetInspectorSection = {
  id: "chroma",
  title: "Chroma key (green screen)",
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "video") return null;
    const data = widget.params.data;
    const active = data.chromaKey ?? null;
    const setChroma = (next: ChromaKeyParams | null) =>
      onUpdateWidgetParams({
        kind: "video",
        data: { ...data, chromaKey: next },
      });
    const setOne = (patch: Partial<ChromaKeyParams>) => {
      const base = active ?? DEFAULT_CHROMA_KEY;
      setChroma({ ...base, ...patch });
    };
    return (
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={Boolean(active)}
            onChange={(e) =>
              setChroma(e.target.checked ? { ...DEFAULT_CHROMA_KEY } : null)
            }
          />
          Enable chroma key
        </label>
        {active && (
          <>
            <Field label="Key colour">
              <ColorInput
                value={active.keyColor}
                onChange={(keyColor) => setOne({ keyColor })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Threshold">
                <NumberField
                  value={Number(active.threshold.toFixed(2))}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(threshold) => setOne({ threshold })}
                />
              </Field>
              <Field label="Softness">
                <NumberField
                  value={Number(active.softness.toFixed(2))}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(softness) => setOne({ softness })}
                />
              </Field>
            </div>
            <Field label="Spill suppression">
              <NumberField
                value={Number(
                  (active.spillSuppression ?? DEFAULT_CHROMA_KEY.spillSuppression ?? 0).toFixed(2),
                )}
                min={0}
                max={1}
                step={0.05}
                onChange={(spillSuppression) => setOne({ spillSuppression })}
              />
            </Field>
            <p className="text-[10px] text-muted-foreground">
              Preview matches export when the render pipeline lands. Today the
              key applies in the editor preview only.
            </p>
          </>
        )}
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
          <div className="flex items-center gap-2">
            <Input
              value={data.recordingUrl ?? ""}
              placeholder="Paste recording URL, or record from your webcam"
              onChange={(e) => set({ recordingUrl: e.target.value || null })}
              className="flex-1"
            />
            <WebcamRecordTrigger
              onCaptured={(url) => set({ recordingUrl: url })}
            />
          </div>
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

// Open-on-click dialog hosting the shared recorder + upload wrapper.
// The wrapper handles the /api/studio/recording/upload roundtrip and
// shows its own failure toast — this trigger just owns the dialog
// shell + writes the resulting URL back into `recordingUrl`.
function WebcamRecordTrigger({ onCaptured }: { onCaptured: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Record from webcam"
          title="Record from webcam"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record from webcam</DialogTitle>
          <DialogDescription>
            Record a clip — it lands in the Recording URL field when you finish.
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          }
        >
          <WebcamRecorderWithUpload
            mode="webcam"
            onCaptured={(url) => {
              onCaptured(url);
              setOpen(false);
            }}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
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
          <UrlPickerInput
            value={data.ctaUrl}
            onChange={(ctaUrl) => set({ ctaUrl })}
            placeholder="https://…"
          >
            <ContentLinkPicker
              onSelect={(ctaUrl) => set({ ctaUrl })}
              label="Link to a resume, profile, company, or job"
            />
          </UrlPickerInput>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Card font (px)">
            <NumberField
              value={data.cardFontPx ?? 24}
              min={8}
              max={120}
              onChange={(cardFontPx) => set({ cardFontPx })}
            />
          </Field>
          <Field label="Button font (px)">
            <NumberField
              value={data.ctaFontPx ?? 14}
              min={8}
              max={96}
              onChange={(ctaFontPx) => set({ ctaFontPx })}
            />
          </Field>
        </div>
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

// ───────────────────────────────────────────────────────────────────────────
// Linked content — pick + switch the bound entity for a `linked-content`
// widget. The body component self-fetches the preview; this section is
// just an entity picker scoped to the user's owned items per kind.
// ───────────────────────────────────────────────────────────────────────────

const LINKED_CONTENT_SECTION: WidgetInspectorSection = {
  id: "linked-content",
  title: "Linked content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "linked-content") return null;
    return (
      <LinkedContentInspector
        data={widget.params.data}
        onChange={(next) =>
          onUpdateWidgetParams({ kind: "linked-content", data: next })
        }
      />
    );
  },
};

function LinkedContentInspector({
  data,
  onChange,
}: {
  data: LinkedContentWidgetParams;
  onChange: (next: LinkedContentWidgetParams) => void;
}) {
  const kind: LinkedContentKind = data.entityKind;
  const meta = LINKED_CONTENT_REGISTRY[kind];
  const [items, setItems] = useState<LinkedContentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    meta
      .listForUser()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : "Couldn't load items.");
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  return (
    <div className="space-y-3">
      <Field label={meta.label}>
        {items === null ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {error ?? `You don't have any ${meta.label.toLowerCase()}s yet.`}
          </div>
        ) : (
          <select
            value={data.entityId}
            onChange={(e) => onChange({ ...data, entityId: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">— Pick a {meta.label.toLowerCase()} —</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.subtitle ? ` (${item.subtitle})` : ""}
              </option>
            ))}
          </select>
        )}
      </Field>
      {data.entityId && (
        <div className="text-[11px] text-muted-foreground">
          CTA opens{" "}
          <a
            href={meta.viewUrl(data.entityId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {meta.viewUrl(data.entityId)}
          </a>
        </div>
      )}
      {/* CTA pill customisation — the same fields the canvas-2D applier
          and DOM `<CtaPill>` read through `resolveLinkedContentCtaTypography`.
          Each input is uncontrolled-default: blank means "use the
          kind default" so an author who hasn't customised anything
          keeps the legacy look. */}
      <Field label={`CTA text (default "${meta.ctaLabel}")`}>
        <Input
          value={data.ctaText ?? ""}
          placeholder={meta.ctaLabel}
          onChange={(e) => {
            const next = e.target.value;
            // Empty input → drop the override so the kind default
            // takes back over. Saving an empty string would lock the
            // pill into "" and render an invisible label.
            if (next === "") {
              const { ctaText: _drop, ...rest } = data;
              onChange(rest);
            } else {
              onChange({ ...data, ctaText: next });
            }
          }}
          className="h-8 text-xs"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Font size (px)">
          <Input
            type="number"
            min={8}
            max={120}
            value={data.ctaFontPx ?? ""}
            placeholder="auto"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                const { ctaFontPx: _drop, ...rest } = data;
                onChange(rest);
              } else {
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) {
                  onChange({ ...data, ctaFontPx: n });
                }
              }
            }}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Weight">
          <select
            value={data.ctaFontWeight ?? "bold"}
            onChange={(e) =>
              onChange({
                ...data,
                ctaFontWeight: e.target.value === "normal" ? "normal" : "bold",
              })
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="bold">Bold</option>
            <option value="normal">Regular</option>
          </select>
        </Field>
      </div>
      <Field label="Font family">
        <Input
          value={data.ctaFontFamily ?? ""}
          placeholder="sans-serif"
          onChange={(e) => {
            const next = e.target.value;
            if (next === "") {
              const { ctaFontFamily: _drop, ...rest } = data;
              onChange(rest);
            } else {
              onChange({ ...data, ctaFontFamily: next });
            }
          }}
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Comic widget Content sections (#939 Phase 2).
// ───────────────────────────────────────────────────────────────────────────

const SPEECH_BUBBLE_SHAPE_OPTIONS = [
  { value: "speech" as const,  label: "Speech (oval + tail)" },
  { value: "thought" as const, label: "Thought (cloud)" },
  { value: "shout" as const,   label: "Shout (jagged star)" },
  { value: "whisper" as const, label: "Whisper (dashed)" },
];

const SFX_SHAPE_OPTIONS = [
  { value: "star" as const,          label: "Star (12-point)" },
  { value: "jagged" as const,        label: "Jagged polygon" },
  { value: "circle-jagged" as const, label: "Bumpy impact" },
  { value: "lightning" as const,     label: "Lightning bolt" },
];

const SPEECH_BUBBLE_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "speech-bubble") return null;
    const data = widget.params.data;
    const set = (next: Partial<SpeechBubbleWidgetParams>) =>
      onUpdateWidgetParams({ kind: "speech-bubble", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Text">
          <AutoSizeTextarea
            value={data.text}
            onChange={(next) => set({ text: next })}
            className="min-h-[60px] text-xs"
          />
        </Field>
        <Field label="Shape">
          <select
            value={data.shape}
            onChange={(e) => set({ shape: e.target.value as SpeechBubbleWidgetParams["shape"] })}
            className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
          >
            {SPEECH_BUBBLE_SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Bubble fill">
          <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
        <Field label="Text colour">
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Stroke colour">
          <ColorInput value={data.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        </Field>
        <Field label="Stroke width">
          <NumberField value={data.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <Field label="Font size (px)">
          <NumberField value={data.fontPx} min={6} onChange={(fontPx) => set({ fontPx })} />
        </Field>
        <Field label="Tail anchor X (0..1)">
          <NumberField
            value={data.tail?.anchorX ?? 0.5}
            min={0}
            max={1}
            onChange={(anchorX) =>
              set({
                tail: { anchorX, anchorY: data.tail?.anchorY ?? 0.9 },
              })
            }
          />
        </Field>
        <Field label="Tail anchor Y (0..1)">
          <NumberField
            value={data.tail?.anchorY ?? 0.9}
            min={0}
            max={1}
            onChange={(anchorY) =>
              set({
                tail: { anchorX: data.tail?.anchorX ?? 0.5, anchorY },
              })
            }
          />
        </Field>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-[11px]"
          onClick={() => set({ tail: data.tail ? null : { anchorX: 0.5, anchorY: 0.9 } })}
        >
          {data.tail ? "Remove tail" : "Add tail"}
        </Button>
      </div>
    );
  },
};

const CAPTION_BOX_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "caption-box") return null;
    const data = widget.params.data;
    const set = (next: Partial<CaptionBoxWidgetParams>) =>
      onUpdateWidgetParams({ kind: "caption-box", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Text">
          <AutoSizeTextarea
            value={data.text}
            onChange={(next) => set({ text: next })}
            className="min-h-[60px] text-xs"
          />
        </Field>
        <Field label="Italic">
          <input
            type="checkbox"
            checked={data.italic}
            onChange={(e) => set({ italic: e.target.checked })}
            className="h-4 w-4"
          />
        </Field>
        <Field label="Box fill">
          <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
        <Field label="Text colour">
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Stroke colour">
          <ColorInput value={data.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        </Field>
        <Field label="Stroke width">
          <NumberField value={data.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <Field label="Font size (px)">
          <NumberField value={data.fontPx} min={6} onChange={(fontPx) => set({ fontPx })} />
        </Field>
      </div>
    );
  },
};

const SFX_BURST_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  title: "Content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "sfx-burst") return null;
    const data = widget.params.data;
    const set = (next: Partial<SfxBurstWidgetParams>) =>
      onUpdateWidgetParams({ kind: "sfx-burst", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label="Text">
          <Input
            value={data.text}
            onChange={(e) => set({ text: e.target.value })}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Shape">
          <select
            value={data.shape}
            onChange={(e) => set({ shape: e.target.value as SfxBurstWidgetParams["shape"] })}
            className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
          >
            {SFX_SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Burst fill">
          <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
        <Field label="Text colour">
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Stroke colour">
          <ColorInput value={data.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        </Field>
        <Field label="Stroke width">
          <NumberField value={data.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <Field label="Font size (px)">
          <NumberField value={data.fontPx} min={6} onChange={(fontPx) => set({ fontPx })} />
        </Field>
      </div>
    );
  },
};

export const WIDGET_INSPECTOR: Record<WidgetKind, WidgetInspectorSection[]> = {
  text: [LAYOUT_SECTION, textContentSection("text"), ...SHARED_TAIL],
  heading: [LAYOUT_SECTION, textContentSection("heading"), ...SHARED_TAIL],
  image: [LAYOUT_SECTION, IMAGE_CONTENT_SECTION, ...SHARED_TAIL],
  video: [LAYOUT_SECTION, VIDEO_CONTENT_SECTION, VIDEO_CHROMA_SECTION, ...SHARED_TAIL],
  "shape-rect": [LAYOUT_SECTION, shapeContentSection("shape-rect"), ...SHARED_TAIL],
  "shape-circle": [LAYOUT_SECTION, shapeContentSection("shape-circle"), ...SHARED_TAIL],
  divider: [LAYOUT_SECTION, DIVIDER_CONTENT_SECTION, ...SHARED_TAIL],
  chart: [LAYOUT_SECTION, CHART_CONTENT_SECTION, ...SHARED_TAIL],
  webcam: [LAYOUT_SECTION, WEBCAM_CONTENT_SECTION, ...SHARED_TAIL],
  chips: [LAYOUT_SECTION, CHIPS_CONTENT_SECTION, ...SHARED_TAIL],
  cta: [LAYOUT_SECTION, CTA_CONTENT_SECTION, ...SHARED_TAIL],
  "linked-content": [LAYOUT_SECTION, LINKED_CONTENT_SECTION, ...SHARED_TAIL],
  // Comic widget primitives (#939 Phase 2 — kind-specific Content
  // sections). Each surfaces the kind's data fields (text + shape
  // picker + per-fill colour + italic toggle + tail anchor) so the
  // user no longer has to drop into the generic effects-params panel
  // to tune a balloon's shape or a caption's italic state.
  "speech-bubble": [LAYOUT_SECTION, SPEECH_BUBBLE_CONTENT_SECTION, ...SHARED_TAIL],
  "caption-box":   [LAYOUT_SECTION, CAPTION_BOX_CONTENT_SECTION, ...SHARED_TAIL],
  "sfx-burst":     [LAYOUT_SECTION, SFX_BURST_CONTENT_SECTION, ...SHARED_TAIL],
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
  "linked-content": "Linked content",
  "speech-bubble": "Speech bubble",
  "caption-box": "Caption box",
  "sfx-burst": "SFX burst",
};
