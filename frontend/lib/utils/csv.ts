// CSV utilities — parse + emit RFC-4180-style CSV.
//
// The parser handles:
//   - quoted fields with embedded commas, double-quoted escapes ("")
//   - embedded newlines inside quoted fields
//   - CRLF (Windows), LF (Unix), CR (legacy Mac) line endings
//   - leading BOM (Excel-on-Windows exports)
//
// What it does NOT do (out of scope for v1):
//   - alternate delimiters (TSV, semicolon-as-decimal locales)
//   - streaming for very large inputs
//   - schema validation — the caller maps row arrays to typed objects.

const BOM = "﻿";

/** Parse a CSV blob into rows of cells. Empty lines are stripped. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      // Open-quote only meaningful at the start of a cell; otherwise treat
      // as literal (matches common spreadsheet behaviour).
      if (cell.length === 0) {
        inQuotes = true;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(cell);
      cell = "";
      // Skip a CRLF pair as one line break.
      if (ch === "\r" && text[i + 1] === "\n") i += 2;
      else i++;
      // Drop fully-empty rows (whitespace-only too).
      if (row.length > 1 || row[0].trim().length > 0) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
    i++;
  }
  // Trailing cell / row.
  if (inQuotes) {
    // Unterminated quote — treat the partial cell as-is rather than throwing.
  }
  row.push(cell);
  if (row.length > 1 || row[0].trim().length > 0) rows.push(row);
  return rows;
}

/** Escape a single cell for emission. */
export function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV blob from a header row + data rows. */
export function buildCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(r.map((c) => csvEscape(c == null ? "" : String(c))).join(","));
  }
  return lines.join("\n");
}

/** Trigger a browser download of a CSV blob. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
