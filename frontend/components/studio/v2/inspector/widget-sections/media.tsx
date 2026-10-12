/**
 * Media widget sections — image, video (+ chroma key), per-widget
 * colour-grading filters, and webcam (+ record dialog trigger).
 */
import { lazy, Suspense, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import type {
  ImageWidgetParams,
  VideoWidgetParams,
  ChromaKeyParams,
  WebcamWidgetParams,
} from "@/lib/studio/editor-v2/canvas-state";
import { DEFAULT_CHROMA_KEY } from "@/lib/studio/chroma-key";
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
import FiltersPicker from "@/components/studio/shared/FiltersPicker";
import { ColorInput, Field, NumberField, SelectField } from "../fields";
import SourceEditor from "../SourceEditor";
import type { WidgetInspectorSection } from "../types";

// Lazy — keeps MediaRecorder + getUserMedia (and the upload helper) off
// the editor's initial bundle. The wrapper owns the upload + fallback
// toast so the inspector and ActionsPanel share one recorder pipeline.
const WebcamRecorderWithUpload = lazy(
  () => import("@/components/studio/WebcamRecorderWithUpload"),
);

const IMAGE_FIT_OPTIONS = [
  { value: "cover" as const, labelKey: "studio.effects.option.fit.cover" },
  { value: "contain" as const, labelKey: "studio.effects.option.fit.contain" },
  { value: "stretch" as const, labelKey: "studio.effects.option.fit.stretch" },
];

export const IMAGE_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "image") return null;
    const data = widget.params.data;
    const set = (next: Partial<ImageWidgetParams>) =>
      onUpdateWidgetParams({ kind: "image", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.inspector.field.source")}>
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
        <Field label={i18n.t("studio.style.fit")}>
          <SelectField<"cover" | "contain" | "stretch">
            value={data.fit}
            options={IMAGE_FIT_OPTIONS}
            onChange={(fit) => set({ fit })}
          />
        </Field>
        <Field label={i18n.t("studio.inspector.field.altText")}>
          <input
            type="text"
            value={data.altText ?? ""}
            placeholder={i18n.t("studio.inspector.altTextPlaceholder")}
            onChange={(e) => set({ altText: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
        </Field>
      </div>
    );
  },
};

export const VIDEO_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "video") return null;
    const data = widget.params.data;
    const set = (next: Partial<VideoWidgetParams>) =>
      onUpdateWidgetParams({ kind: "video", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.inspector.field.source")}>
          <SourceEditor accept="video" source={data.source} onChange={(source) => set({ source })} />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={data.muted}
            onChange={(e) => set({ muted: e.target.checked })}
          />
          {i18n.t("studio.effects.param.muted")}
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
export const VIDEO_CHROMA_SECTION: WidgetInspectorSection = {
  id: "chroma",
  titleKey: "studio.inspector.section.chromaKey",
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
          {i18n.t("studio.inspector.enableChromaKey")}
        </label>
        {active && (
          <>
            <Field label={i18n.t("studio.inspector.field.keyColour")}>
              <ColorInput
                value={active.keyColor}
                onChange={(keyColor) => setOne({ keyColor })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={i18n.t("studio.effects.param.threshold")}>
                <NumberField
                  value={Number(active.threshold.toFixed(2))}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(threshold) => setOne({ threshold })}
                />
              </Field>
              <Field label={i18n.t("studio.effects.param.softness")}>
                <NumberField
                  value={Number(active.softness.toFixed(2))}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(softness) => setOne({ softness })}
                />
              </Field>
            </div>
            <Field label={i18n.t("studio.effects.param.spillSuppression")}>
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
              {i18n.t("studio.inspector.chromaPreviewNote")}
            </p>
          </>
        )}
      </div>
    );
  },
};

/** Per-widget colour-grading filters (#596 / #806). Self-gates to image
 *  + video widgets (the only kinds carrying a `filters` field). Reuses
 *  the same `<FiltersPicker>` the scene-level grade uses, so a widget
 *  grade and a scene grade share one control + one `VideoFilters` shape.
 *  The DOM preview folds the grade into the widget's CSS `filter`; the
 *  canvas-v2 image/video appliers bake the identical grade into export. */
export const WIDGET_FILTERS_SECTION: WidgetInspectorSection = {
  id: "filters",
  titleKey: "studio.sidebar.filters",
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind === "image") {
      const data = widget.params.data;
      return (
        <FiltersPicker
          filters={data.filters ?? null}
          onChange={(filters) =>
            onUpdateWidgetParams({ kind: "image", data: { ...data, filters } })
          }
        />
      );
    }
    if (widget.params.kind === "video") {
      const data = widget.params.data;
      return (
        <FiltersPicker
          filters={data.filters ?? null}
          onChange={(filters) =>
            onUpdateWidgetParams({ kind: "video", data: { ...data, filters } })
          }
        />
      );
    }
    return null;
  },
};

export const WEBCAM_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "webcam") return null;
    const data = widget.params.data;
    const set = (next: Partial<WebcamWidgetParams>) =>
      onUpdateWidgetParams({ kind: "webcam", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.effects.param.recordingUrl")}>
          <div className="flex items-center gap-2">
            <Input
              value={data.recordingUrl ?? ""}
              placeholder={i18n.t("studio.inspector.webcam.urlPlaceholder")}
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
          {i18n.t("studio.inspector.webcam.mirror")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={data.muted ?? false}
            onChange={(e) => set({ muted: e.target.checked })}
          />
          {i18n.t("studio.effects.param.muted")}
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={t("studio.inspector.webcam.record")}
          title={t("studio.inspector.webcam.record")}
        >
          <Camera className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("studio.inspector.webcam.record")}</DialogTitle>
          <DialogDescription>
            {t("studio.inspector.webcam.recordHelp")}
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("status.loading")}
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
