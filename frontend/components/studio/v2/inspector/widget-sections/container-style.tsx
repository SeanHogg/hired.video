/**
 * Container style + effects sections — part of the shared tail applied
 * to every widget kind.
 */
import i18n from "@/lib/i18n/i18n";
import type { ContainerStyle } from "@/lib/studio/editor-v2/canvas-state";
import EffectStackEditor from "@/components/studio/effects/EffectStackEditor";
import { ColorInput, Field, NumberField } from "../fields";
import type { WidgetInspectorSection } from "../types";

export const CONTAINER_STYLE_SECTION: WidgetInspectorSection = {
  id: "container-style",
  titleKey: "studio.inspector.section.containerStyle",
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
          <Field label={i18n.t("studio.style.bg")}>
            <ColorInput
              value={cs.backgroundColor ?? "#000000"}
              onChange={(backgroundColor) => setOne({ backgroundColor })}
            />
          </Field>
          <Field label={i18n.t("studio.style.border")}>
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
          {/* Labelled "Container radius" to disambiguate from a shape's own
              "Corner radius" (ShapeWidgetParams.cornerRadius) — for a
              shape-rect both round visually, so the scope must read off the
              label (#657). This rounds the outer container wrapper; the shape
              field rounds the drawn shape. */}
          <Field label={i18n.t("studio.inspector.field.containerRadius")}>
            <NumberField
              value={cs.borderRadius ?? 0}
              min={0}
              onChange={(borderRadius) => setOne({ borderRadius })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={i18n.t("studio.inspector.field.borderWidth")}>
            <NumberField
              value={cs.borderWidth ?? 0}
              min={0}
              onChange={(borderWidth) => setOne({ borderWidth })}
            />
          </Field>
          <Field label={i18n.t("studio.inspector.field.padding")}>
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
            {i18n.t("studio.clearContainerStyling")}
          </button>
        )}
      </div>
    );
  },
};

export const EFFECTS_SECTION: WidgetInspectorSection = {
  id: "effects",
  titleKey: "build.sceneInspector.effects",
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
