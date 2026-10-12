/**
 * Shape (rect/circle), chart, divider and chips Content sections.
 */
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import type {
  ShapeWidgetParams,
  DividerWidgetParams,
  ChartWidgetParams,
  ChipsWidgetParams,
} from "@/lib/studio/editor-v2/canvas-state";
import { FONT_PRESETS } from "@/lib/studio/font-catalog";
import { Input } from "@/components/ui/input";
import { AutoSizeTextarea, ColorInput, Field, NumberField, SelectField } from "../fields";
import type { WidgetInspectorSection } from "../types";

export function shapeContentSection(kind: "shape-rect" | "shape-circle"): WidgetInspectorSection {
  return {
    id: "content",
    titleKey: "studio.inspector.section.content",
    defaultOpen: true,
    render: ({ widget, onUpdateWidgetParams }) => {
      if (widget.params.kind !== kind) return null;
      const data = widget.params.data;
      const set = (next: Partial<ShapeWidgetParams>) =>
        onUpdateWidgetParams({ kind, data: { ...data, ...next } });
      return (
        <div className="space-y-3">
          <Field label={i18n.t("studio.effects.param.fill")}>
            <ColorInput value={data.fill} onChange={(fill) => set({ fill })} />
          </Field>
          <Field label={i18n.t("studio.inspector.field.strokeColour")}>
            <ColorInput
              value={data.strokeColor}
              onChange={(strokeColor) => set({ strokeColor })}
            />
          </Field>
          <Field label={i18n.t("studio.inspector.field.strokeWidth")}>
            <NumberField
              value={data.strokeWidth}
              min={0}
              onChange={(strokeWidth) => set({ strokeWidth })}
            />
          </Field>
          {kind === "shape-rect" && (
            <Field label={i18n.t("studio.effects.param.cornerRadius")}>
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

const CHART_TYPE_OPTIONS: ReadonlyArray<{ value: ChartWidgetParams["chartType"]; labelKey: string }> = [
  { value: "bar",     labelKey: "studio.inspector.chart.bar" },
  { value: "line",    labelKey: "studio.inspector.chart.line" },
  { value: "pie",     labelKey: "studio.inspector.chart.pie" },
  { value: "scatter", labelKey: "studio.inspector.chart.scatter" },
];

const CHART_FORMAT_OPTIONS: ReadonlyArray<{
  value: NonNullable<ChartWidgetParams["format"]>;
  label: string;
}> = [
  { value: "csv",  label: "CSV" },
  { value: "tsv",  label: "TSV" },
  { value: "json", label: "JSON" },
];

export const CHART_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "chart") return null;
    const data = widget.params.data;
    const set = (next: Partial<ChartWidgetParams>) =>
      onUpdateWidgetParams({ kind: "chart", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.effects.param.chartType")}>
          <SelectField<ChartWidgetParams["chartType"]>
            value={data.chartType}
            options={CHART_TYPE_OPTIONS}
            onChange={(chartType) => set({ chartType })}
          />
        </Field>
        <Field label={i18n.t("studio.effects.param.data")}>
          <AutoSizeTextarea
            value={data.data}
            onChange={(next) => set({ data: next })}
            minRows={6}
            placeholder={"category,value\nQ1,42\nQ2,65"}
            className="font-mono text-xs"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={i18n.t("studio.inspector.field.format")}>
            <SelectField<NonNullable<ChartWidgetParams["format"]>>
              value={data.format ?? "csv"}
              options={CHART_FORMAT_OPTIONS}
              onChange={(format) => set({ format })}
            />
          </Field>
          <Field label={i18n.t("studio.effects.param.title")}>
            <Input
              value={data.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
        </div>
        <Field label={i18n.t("studio.effects.param.takeaway")}>
          <Input
            value={data.takeaway ?? ""}
            onChange={(e) => set({ takeaway: e.target.value })}
            placeholder={i18n.t("studio.inspector.takeawayPlaceholder")}
          />
        </Field>
        <Field label={i18n.t("studio.inspector.field.seriesColours")}>
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
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      {value.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          {t("studio.inspector.chartColoursHint")}
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
              {t("actions.remove")}
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...value, CHART_COLOR_DEFAULTS[value.length % CHART_COLOR_DEFAULTS.length]])}
        className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("studio.inspector.addColour")}
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

export const DIVIDER_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "divider") return null;
    const data = widget.params.data;
    const set = (next: Partial<DividerWidgetParams>) =>
      onUpdateWidgetParams({ kind: "divider", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.inspector.field.colour")}>
          <ColorInput value={data.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label={i18n.t("studio.effects.param.thickness")}>
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
  { value: "", labelKey: "studio.inspector.defaultFont" },
  ...FONT_PRESETS.map((preset) => ({ value: preset.family, label: preset.label })),
];

export const CHIPS_CONTENT_SECTION: WidgetInspectorSection = {
  id: "chips-content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "chips") return null;
    const data = widget.params.data;
    const set = (next: Partial<ChipsWidgetParams>) =>
      onUpdateWidgetParams({ kind: "chips", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.inspector.field.chipsPerLine")}>
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
        <Field label={i18n.t("studio.style.layout")}>
          <select
            value={data.direction}
            onChange={(e) => set({ direction: e.target.value as ChipsWidgetParams["direction"] })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="row">{i18n.t("studio.effects.option.direction.row")}</option>
            <option value="column">{i18n.t("studio.effects.option.direction.column")}</option>
          </select>
        </Field>
        <Field label={i18n.t("studio.inspector.field.chipColour")}>
          <ColorInput value={data.chipColor} onChange={(chipColor) => set({ chipColor })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.textColour")}>
          <ColorInput value={data.textColor} onChange={(textColor) => set({ textColor })} />
        </Field>
        <Field label={i18n.t("studio.effects.param.fontPx")}>
          <NumberField
            value={data.fontPx}
            min={8}
            max={96}
            onChange={(fontPx) => set({ fontPx })}
          />
        </Field>
        <Field label={i18n.t("studio.sidebar.font")}>
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
