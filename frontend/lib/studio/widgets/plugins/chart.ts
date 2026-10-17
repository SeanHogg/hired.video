/** Chart widget plugin — one `drawChart` call, run by the export on its
 *  frame and by the DOM on a <canvas> (a raster op), so both show the same
 *  pixels. */
import type { ChartWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { drawChart } from "@/lib/studio/chart-canvas";
import { stringOr } from "@/lib/numeric";
import { registerPlugin } from "../plugin";
import { oneOf, optionalString, stringArray, when } from "./shared";

type ChartParams = Extract<WidgetParams, { data: ChartWidgetParams }>;

const CHART_TYPES = ["bar", "line", "pie", "scatter"] as const;
const FORMATS = ["csv", "tsv", "json"] as const;
/** Axis / label colour — the export has always drawn white. */
export const CHART_FOREGROUND = "#ffffff";

export const chartPlugin = registerPlugin<ChartParams>({
  effectKind: "canvas-v2:chart",
  widgetKinds: ["chart"],
  meta: {
    labelKey: "studio.effects.kind.chart",
    category: "transform",
    defaults: { x: 0, y: 0, width: 0.5, height: 0.4, chartType: "bar", data: "", format: "csv", title: "", takeaway: "", colors: [] },
  },
  emit: (p) => ({
    chartType: p.data.chartType,
    data: p.data.data,
    format: p.data.format ?? "csv",
    title: p.data.title ?? "",
    takeaway: p.data.takeaway ?? "",
    colors: p.data.colors ?? [],
  }),
  parse: (raw) => {
    const colors = stringArray(raw.colors);
    return {
      kind: "chart",
      data: {
        chartType: oneOf(raw.chartType, CHART_TYPES, "bar"),
        data: stringOr(raw.data, ""),
        format: oneOf(raw.format, FORMATS, "csv"),
        ...when("title", optionalString(raw.title)),
        ...when("takeaway", optionalString(raw.takeaway)),
        ...when("colors", colors.length > 0 ? colors : undefined),
      },
    };
  },
  draw({ data }, content) {
    const opts = {
      chartType: data.chartType,
      data: data.data,
      format: data.format,
      title: data.title || undefined,
      takeaway: data.takeaway || undefined,
      colors: data.colors && data.colors.length > 0 ? data.colors : undefined,
      foreground: CHART_FOREGROUND,
    };
    return [
      {
        op: "raster",
        box: content,
        key: JSON.stringify(opts),
        paint: (ctx, box) => drawChart(ctx, { ...opts, x: box.x, y: box.y, w: box.w, h: box.h }),
      },
    ];
  },
});
