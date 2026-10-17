/**
 * escapeHtml — the one HTML escaper for every server- and client-rendered
 * HTML string (emails, print shells, error reports, exports).
 *
 * Escapes the strict set `& < > " '` so the output is safe in element text
 * AND in single- or double-quoted attribute values. `null`/`undefined`
 * become "" and anything else is stringified first.
 */
export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
