// Intake for "Data Analysis" — accepts a CSV / TSV / JSON sample (paste or
// upload), lets the user pick a chart type, and toggles whether the AI
// should summarize the takeaway. Output is serialized into resumeText.

import { useEffect, useMemo, useState } from "react";
import { BarChart3, LineChart, PieChart, ScatterChart, Upload, Wand2, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import ChartRenderer from "@/components/studio/charts/ChartRenderer";
import { detectChartFormat, parseChartData } from "@/lib/studio/chart-data";
import type { ChartType } from "@/types/video-script";
import type { IntakeProps } from "@/lib/studio/templates/catalog";

const CHART_OPTIONS: Array<{ value: ChartType; label: string; icon: LucideIcon }> = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: LineChart },
  { value: "pie", label: "Pie", icon: PieChart },
  { value: "scatter", label: "Scatter", icon: ScatterChart },
];

interface FormState {
  title: string;
  takeaway: string;
  data: string;
  chart: ChartType;
  llmSummary: boolean;
}

const DEFAULT: FormState = {
  title: "",
  takeaway: "",
  data: "",
  chart: "bar",
  llmSummary: true,
};

const HEADER = "Data Analysis";

// Format detection + JSON/CSV parsing live in lib/studio/chart-data so
// the intake, the storyboard chart element, and the export-time
// rasteriser all read the same answer. We keep a small local helper
// just for the table-row preview (which wants raw cells, not parsed
// numerics) — uses the shared `detectChartFormat`.
function previewRows(s: string): string[][] {
  const fmt = detectChartFormat(s);
  if (fmt === "json" || fmt === "unknown") return [];
  const sep = fmt === "tsv" ? "\t" : ",";
  return s.trim().split(/\r?\n/).slice(0, 6).map((line) => line.split(sep));
}

function serialize(form: FormState): string {
  const lines = [HEADER];
  if (form.title) lines.push(`Topic: ${form.title}`);
  lines.push(`Chart type: ${form.chart}`);
  if (form.takeaway) lines.push(`\nTakeaway:\n${form.takeaway}`);
  if (form.data) {
    const fmt = detectChartFormat(form.data);
    lines.push(`\nData (${fmt}):\n${form.data.slice(0, 4000)}`);
  }
  if (form.llmSummary) {
    lines.push("\n[Auto-generate AI commentary on the trend.]");
  }
  return lines.join("\n");
}

export default function DataAnalysisIntake({ onStateChange }: IntakeProps) {
  const [form, setForm] = useState<FormState>(DEFAULT);

  useEffect(() => {
    onStateChange({ resumeText: serialize(form) });
  }, [form]);

  const rows = useMemo(() => previewRows(form.data), [form.data]);
  const fmt = detectChartFormat(form.data);
  // Parsed result drives the live chart preview below — we still keep
  // the raw `form.data` string as the source of truth (round-trips into
  // the saved scene element when the user converts intake → storyboard).
  const parsed = useMemo(() => parseChartData(form.data, fmt === "unknown" ? undefined : fmt), [form.data, fmt]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setForm((s) => ({ ...s, data: text }));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <Label htmlFor="da-title" className="mb-1.5 block">Topic</Label>
        <Input
          id="da-title"
          placeholder="e.g. Quarterly user growth"
          value={form.title}
          onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
        />
      </div>

      <div>
        <Label className="mb-2 block">Chart type</Label>
        <div className="grid grid-cols-4 gap-2">
          {CHART_OPTIONS.map((opt) => {
            const on = form.chart === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((s) => ({ ...s, chart: opt.value }))}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg border transition-colors",
                  on ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40 hover:bg-accent",
                )}
                aria-pressed={on}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px] font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="da-data">Data sample</Label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline cursor-pointer">
            <Upload className="w-3 h-3" />
            Upload CSV / TSV / JSON
            <input
              type="file"
              accept=".csv,.tsv,.json,text/csv,text/tab-separated-values,application/json,text/plain"
              className="hidden"
              onChange={handleFile}
            />
          </label>
        </div>
        <Textarea
          id="da-data"
          className="h-32 resize-none text-[11px] font-mono"
          placeholder={"date,users\n2026-01,100\n2026-02,180"}
          value={form.data}
          onChange={(e) => setForm((s) => ({ ...s, data: e.target.value }))}
        />
        {form.data.trim() && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Detected format: <span className="font-mono">{fmt}</span>
            {rows.length > 0 && (
              <> · {rows.length - 1 >= 0 ? rows.length : 0} rows previewed</>
            )}
          </p>
        )}
        {rows.length > 0 && fmt !== "json" && (
          <div className="mt-2 border rounded-md overflow-hidden text-[10px]">
            <table className="w-full">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i === 0 ? "bg-muted/40 font-semibold" : ""}>
                    {r.map((cell, j) => (
                      <td key={j} className="px-2 py-1 border-t first:border-t-0 truncate max-w-[120px]">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Live chart preview — same <ChartRenderer> the storyboard
            uses, so what users see here is exactly what'll render in
            their scene. Self-hides via the renderer's empty-state when
            there's no parseable data yet. */}
        {parsed.rows.length > 0 && (
          <div className="mt-3 h-48 rounded-md border bg-muted/10 p-2">
            <ChartRenderer
              chartType={form.chart}
              data={form.data}
              format={fmt === "unknown" ? undefined : fmt}
              title={form.title || undefined}
            />
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="da-takeaway" className="mb-1.5 block">Key takeaway</Label>
        <Textarea
          id="da-takeaway"
          className="h-20 resize-none text-xs"
          placeholder="The one insight you want viewers to walk away with."
          value={form.takeaway}
          onChange={(e) => setForm((s) => ({ ...s, takeaway: e.target.value }))}
        />
      </div>

      <label className="flex items-start gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.llmSummary}
          onChange={(e) => setForm((s) => ({ ...s, llmSummary: e.target.checked }))}
        />
        <span className="flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-primary" />
          Let the AI commentate on the trend in voiceover
        </span>
      </label>
    </div>
  );
}
