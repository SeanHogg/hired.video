/**
 * Chart data helpers — shared format detection + parsing used by every
 * chart surface (DataAnalysisIntake, ChartRenderer, the compiler's
 * export-time rasteriser).
 *
 * Single source of truth for "what is this string?" and "give me rows
 * I can plot from it." Centralised so a future format (Markdown table,
 * tab-separated values pasted from Excel, etc.) only needs one edit.
 */

export type ChartFormat = "csv" | "tsv" | "json" | "unknown";

/** Detect the format of a pasted/uploaded data sample. Cheap heuristic:
 *  JSON wins on `[`/`{`, TSV beats CSV on tab presence, otherwise CSV. */
export function detectChartFormat(s: string): ChartFormat {
  const trimmed = s.trim();
  if (!trimmed) return "unknown";
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  if (trimmed.includes("\t")) return "tsv";
  if (trimmed.includes(",")) return "csv";
  return "unknown";
}

export interface ChartParseResult {
  /** Field names in render order (first column = label / x-axis,
   *  remainder = numeric series). */
  keys: string[];
  /** Parsed rows, each one a `{ key: value }` map matching `keys`. */
  rows: Array<Record<string, string | number>>;
  /** Format the parser actually used. */
  format: ChartFormat;
}

const EMPTY: ChartParseResult = { keys: [], rows: [], format: "unknown" };

/** Parse the data string into a row array recharts can consume. Lenient
 *  by design — bad rows are skipped, not thrown. Returns an empty
 *  result on unparseable input so the renderer can show an axis-only
 *  placeholder instead of crashing the canvas. */
export function parseChartData(input: string, format?: ChartFormat): ChartParseResult {
  const trimmed = input?.trim();
  if (!trimmed) return EMPTY;

  const fmt = format ?? detectChartFormat(trimmed);
  if (fmt === "json") return parseJson(trimmed);
  if (fmt === "csv" || fmt === "tsv") return parseDelimited(trimmed, fmt === "tsv" ? "\t" : ",");
  return EMPTY;
}

function parseDelimited(input: string, sep: string): ChartParseResult {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return EMPTY;
  const keys = lines[0].split(sep).map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return EMPTY;
  const rows: Array<Record<string, string | number>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim());
    if (cells.length === 0) continue;
    const row: Record<string, string | number> = {};
    for (let k = 0; k < keys.length; k++) {
      const raw = cells[k] ?? "";
      const asNum = Number(raw);
      row[keys[k]] = raw !== "" && Number.isFinite(asNum) ? asNum : raw;
    }
    rows.push(row);
  }
  return { keys, rows, format: sep === "\t" ? "tsv" : "csv" };
}

function parseJson(input: string): ChartParseResult {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed) || parsed.length === 0) return EMPTY;
    const first = parsed[0];
    if (typeof first !== "object" || first === null) return EMPTY;
    const keys = Object.keys(first);
    const rows = parsed
      .filter((r) => typeof r === "object" && r !== null)
      .map((r) => {
        const row: Record<string, string | number> = {};
        for (const k of keys) {
          const v = (r as Record<string, unknown>)[k];
          if (typeof v === "number") row[k] = v;
          else if (typeof v === "string") {
            const n = Number(v);
            row[k] = v !== "" && Number.isFinite(n) ? n : v;
          } else if (v == null) {
            row[k] = "";
          } else {
            row[k] = String(v);
          }
        }
        return row;
      });
    return { keys, rows, format: "json" };
  } catch {
    return EMPTY;
  }
}

/** Default palette used when a chart element doesn't override colours.
 *  Pulled out as a constant so the export rasteriser and the live
 *  preview always agree. */
export const DEFAULT_CHART_COLORS = [
  "#7c3aed", // brand purple
  "#2563eb", // brand blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
];
