/**
 * Comic widget Content sections (#939 Phase 2) — speech bubble,
 * caption box, SFX burst.
 */
import i18n from "@/lib/i18n/i18n";
import type {
  SpeechBubbleWidgetParams,
  CaptionBoxWidgetParams,
  SfxBurstWidgetParams,
} from "@/lib/studio/editor-v2/canvas-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AutoSizeTextarea, ColorInput, Field, NumberField } from "../fields";
import type { WidgetInspectorSection } from "../types";

const SPEECH_BUBBLE_SHAPE_OPTIONS = [
  { value: "speech" as const,  labelKey: "studio.inspector.bubble.speech" },
  { value: "thought" as const, labelKey: "studio.inspector.bubble.thought" },
  { value: "shout" as const,   labelKey: "studio.inspector.bubble.shout" },
  { value: "whisper" as const, labelKey: "studio.inspector.bubble.whisper" },
];

const SFX_SHAPE_OPTIONS = [
  { value: "star" as const,          labelKey: "studio.inspector.sfx.star" },
  { value: "jagged" as const,        labelKey: "studio.inspector.sfx.jagged" },
  { value: "circle-jagged" as const, labelKey: "studio.inspector.sfx.circleJagged" },
  { value: "lightning" as const,     labelKey: "studio.inspector.sfx.lightning" },
];

export const SPEECH_BUBBLE_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "speech-bubble") return null;
    const data = widget.params.data;
    const set = (next: Partial<SpeechBubbleWidgetParams>) =>
      onUpdateWidgetParams({ kind: "speech-bubble", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.style.text")}>
          <AutoSizeTextarea
            value={data.text}
            onChange={(next) => set({ text: next })}
            className="min-h-[60px] text-xs"
          />
        </Field>
        <Field label={i18n.t("studio.effects.param.shape")}>
          <select
            value={data.shape}
            onChange={(e) => set({ shape: e.target.value as SpeechBubbleWidgetParams["shape"] })}
            className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
          >
            {SPEECH_BUBBLE_SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{i18n.t(o.labelKey)}</option>
            ))}
          </select>
        </Field>
        <Field label={i18n.t("studio.inspector.field.bubbleFill")}>
          <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.textColour")}>
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.strokeColour")}>
          <ColorInput value={data.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.strokeWidth")}>
          <NumberField value={data.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <Field label={i18n.t("studio.effects.param.fontPx")}>
          <NumberField value={data.fontPx} min={6} onChange={(fontPx) => set({ fontPx })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.tailAnchorX")}>
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
        <Field label={i18n.t("studio.inspector.field.tailAnchorY")}>
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
          {i18n.t(data.tail ? "studio.inspector.removeTail" : "studio.inspector.addTail")}
        </Button>
      </div>
    );
  },
};

export const CAPTION_BOX_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "caption-box") return null;
    const data = widget.params.data;
    const set = (next: Partial<CaptionBoxWidgetParams>) =>
      onUpdateWidgetParams({ kind: "caption-box", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.style.text")}>
          <AutoSizeTextarea
            value={data.text}
            onChange={(next) => set({ text: next })}
            className="min-h-[60px] text-xs"
          />
        </Field>
        <Field label={i18n.t("studio.effects.param.italic")}>
          <input
            type="checkbox"
            checked={data.italic}
            onChange={(e) => set({ italic: e.target.checked })}
            className="h-4 w-4"
          />
        </Field>
        <Field label={i18n.t("studio.inspector.field.boxFill")}>
          <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.textColour")}>
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.strokeColour")}>
          <ColorInput value={data.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.strokeWidth")}>
          <NumberField value={data.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <Field label={i18n.t("studio.effects.param.fontPx")}>
          <NumberField value={data.fontPx} min={6} onChange={(fontPx) => set({ fontPx })} />
        </Field>
      </div>
    );
  },
};

export const SFX_BURST_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "sfx-burst") return null;
    const data = widget.params.data;
    const set = (next: Partial<SfxBurstWidgetParams>) =>
      onUpdateWidgetParams({ kind: "sfx-burst", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.style.text")}>
          <Input
            value={data.text}
            onChange={(e) => set({ text: e.target.value })}
            className="h-8 text-xs"
          />
        </Field>
        <Field label={i18n.t("studio.effects.param.shape")}>
          <select
            value={data.shape}
            onChange={(e) => set({ shape: e.target.value as SfxBurstWidgetParams["shape"] })}
            className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
          >
            {SFX_SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{i18n.t(o.labelKey)}</option>
            ))}
          </select>
        </Field>
        <Field label={i18n.t("studio.inspector.field.burstFill")}>
          <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.textColour")}>
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.strokeColour")}>
          <ColorInput value={data.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.strokeWidth")}>
          <NumberField value={data.strokeWidth} min={0} onChange={(strokeWidth) => set({ strokeWidth })} />
        </Field>
        <Field label={i18n.t("studio.effects.param.fontPx")}>
          <NumberField value={data.fontPx} min={6} onChange={(fontPx) => set({ fontPx })} />
        </Field>
      </div>
    );
  },
};
