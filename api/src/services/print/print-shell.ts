/**
 * Shared print-to-PDF document chrome (#1440, #243).
 *
 * Browser print-to-PDF is used across the app (workforce invoices/timesheets,
 * candidate packets) instead of a server-side PDF library because Cloudflare
 * Workers can't run pdfkit/pdf-lib. The HTML is Letter-sized via @page CSS,
 * auto-fires `window.print()` on load, and hides anything tagged `.no-print`
 * when actually printing.
 *
 * This module is the single source for that chrome + the HTML escaper so each
 * print surface only supplies its own body markup (+ optional extra CSS).
 */

export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(
  amount: string | number | null | undefined,
  currency = "USD",
): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

/**
 * Wrap body markup with the print-ready document chrome — Letter page,
 * sans-serif, action bar that hides on print, auto print dialog. `extraCss`
 * is appended to the base stylesheet so each surface can add its own rules
 * without forking the chrome.
 */
export function printShell(title: string, body: string, extraCss = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; font-size: 11pt; }
  h1 { font-size: 20pt; margin: 0 0 0.25rem; }
  h2 { font-size: 13pt; margin: 1rem 0 0.5rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-weight: 600; background: #f6f6f7; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
  .muted { color: #666; font-size: 9pt; }
  .totals { margin-top: 1rem; display: grid; grid-template-columns: auto auto; gap: 4px 16px; width: max-content; margin-left: auto; }
  .totals .label { color: #666; }
  .totals .value { font-variant-numeric: tabular-nums; text-align: right; }
  .totals .grand { font-weight: 700; font-size: 13pt; border-top: 2px solid #111; padding-top: 6px; margin-top: 4px; }
  .actions { display: flex; gap: 0.5rem; margin: 1rem 0; }
  .actions button { font-size: 11pt; padding: 6px 14px; border: 1px solid #ddd; background: #fff; cursor: pointer; border-radius: 4px; }
  .actions button:hover { background: #f6f6f7; }
  .footer { margin-top: 1.5rem; font-size: 9pt; color: #666; border-top: 1px solid #eee; padding-top: 0.5rem; }
  @media print { .no-print { display: none !important; } body { font-size: 10pt; } }
${extraCss}
</style>
</head>
<body>
<div class="no-print actions">
  <button onclick="window.print()">Print / Save as PDF</button>
  <button onclick="window.close()">Close</button>
</div>
${body}
<script>
  // Auto-prompt the print dialog so the URL doubles as a one-click PDF export.
  // Users who landed via a navigation can still hit Esc and use the Print button.
  setTimeout(() => { try { window.print(); } catch (e) {} }, 250);
</script>
</body>
</html>`;
}
