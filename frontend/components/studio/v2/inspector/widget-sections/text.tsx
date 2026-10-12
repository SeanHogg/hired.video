/**
 * Text / heading Content section.
 */
import i18n from "@/lib/i18n/i18n";
import type { TextWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { AutoSizeTextarea, ColorInput, Field, NumberField, SelectField } from "../fields";
import type { WidgetInspectorSection } from "../types";

const ALIGN_OPTIONS = [
  { value: "left" as const, labelKey: "studio.align.left" },
  { value: "center" as const, labelKey: "studio.align.center" },
  { value: "right" as const, labelKey: "studio.align.right" },
];

const FONT_WEIGHT_OPTIONS = [
  { value: "normal" as const, labelKey: "studio.inspector.option.regular" },
  { value: "bold" as const, labelKey: "studio.inspector.option.bold" },
];

export function textContentSection(kind: "text" | "heading"): WidgetInspectorSection {
  return {
    id: "content",
    titleKey: "studio.inspector.section.content",
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
            ariaLabel={i18n.t(kind === "heading" ? "studio.inspector.headingTextAria" : "studio.inspector.textContentAria")}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label={i18n.t("studio.effects.param.fontPx")}>
              <NumberField
                value={data.fontPx}
                min={8}
                onChange={(fontPx) => set({ fontPx })}
              />
            </Field>
            <Field label={i18n.t("studio.inspector.field.weight")}>
              <SelectField<"normal" | "bold">
                value={data.fontWeight}
                options={FONT_WEIGHT_OPTIONS}
                onChange={(fontWeight) => set({ fontWeight })}
              />
            </Field>
          </div>
          <Field label={i18n.t("studio.inspector.field.colour")}>
            <ColorInput value={data.color} onChange={(color) => set({ color })} />
          </Field>
          <Field label={i18n.t("studio.effects.param.align")}>
            <SelectField<"left" | "center" | "right">
              value={data.align}
              options={ALIGN_OPTIONS}
              onChange={(align) => set({ align })}
            />
          </Field>
          <Field label={i18n.t("studio.effects.param.background")}>
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
                {i18n.t("studio.sidebar.removeBackground")}
              </button>
            )}
          </Field>
        </div>
      );
    },
  };
}
