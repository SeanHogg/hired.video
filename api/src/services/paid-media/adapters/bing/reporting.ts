/**
 * Microsoft Advertising reporting (#977) — Reporting service v13, which is
 * asynchronous: submit a report request, poll it, download a zipped CSV.
 *
 *   POST {REPORTING}/GenerateReport/Submit  { ReportRequest } → { ReportRequestId }
 *   POST {REPORTING}/GenerateReport/Poll    { ReportRequestId }
 *        → { ReportRequestStatus: { Status: Pending|Success|Error, ReportDownloadUrl } }
 *   GET  ReportDownloadUrl                  → .zip holding one CSV
 *
 * Workers Free: ONE poll per call, never a wait loop. A report that isn't
 * ready returns `{ pending: true, reportRequestId }`; the sync service
 * records it and a later run polls again with `pendingReportId`.
 *
 * Docs: https://learn.microsoft.com/en-us/advertising/reporting-service/submitgeneratereport
 *       https://learn.microsoft.com/en-us/advertising/reporting-service/pollgeneratereport
 *       https://learn.microsoft.com/en-us/advertising/guides/request-download-report
 */

import { PaidMediaAdapterError } from "../../ports/adapter.js";
import type { InsightRow, InsightsQuery, InsightsResult } from "../../ports/types.js";

export const MS_REPORTING_API = "https://reporting.api.bingads.microsoft.com/Reporting/v13";

/** JSON POST against MS_REPORTING_API (auth + error mapping injected). */
export type BingReportingCall = (path: string, body: unknown) => Promise<any>;
/** GET the pre-signed download URL; returns the raw bytes. */
export type BingDownload = (url: string) => Promise<ArrayBuffer>;

const REPORT_SHAPE = {
  campaign: { type: "CampaignPerformanceReportRequest", idColumn: "CampaignId" },
  ad_set: { type: "AdGroupPerformanceReportRequest", idColumn: "AdGroupId" },
  ad: { type: "AdPerformanceReportRequest", idColumn: "AdId" },
} as const;

function msDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { Day: d, Month: m, Year: y };
}

/** SubmitGenerateReport body for one query. */
export function buildReportRequest(accountId: string, query: InsightsQuery) {
  const shape = REPORT_SHAPE[query.resourceKind];
  return {
    ReportRequest: {
      Type: shape.type,
      Format: "Csv",
      FormatVersion: "2.0",
      ReportName: `hired.video ${query.resourceKind} ${query.since}..${query.until}`,
      ReturnOnlyCompleteData: false,
      ExcludeReportHeader: true,
      ExcludeReportFooter: true,
      ExcludeColumnHeaders: false,
      Aggregation: "Daily",
      Columns: ["TimePeriod", shape.idColumn, "Impressions", "Clicks", "Spend", "Conversions"],
      Scope: { AccountIds: [Number(accountId)] },
      Time: {
        CustomDateRangeStart: msDate(query.since),
        CustomDateRangeEnd: msDate(query.until),
        ReportTimeZone: "GreenwichMeanTimeDublinEdinburghLisbonLondon",
      },
    },
  };
}

// ── zip + CSV (tiny, dependency-free) ──────────────────────────────────────

/** Text of the first entry of a zip archive (stored or deflated). */
export async function unzipFirstEntry(buf: ArrayBuffer): Promise<string> {
  const view = new DataView(buf);
  if (view.byteLength < 30 || view.getUint32(0, true) !== 0x04034b50) {
    // Not a zip — some environments hand back the CSV directly.
    return new TextDecoder().decode(buf);
  }
  const flags = view.getUint16(6, true);
  const method = view.getUint16(8, true);
  let compSize = view.getUint32(18, true);
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const start = 30 + nameLen + extraLen;
  if ((flags & 0x08) !== 0 || compSize === 0) {
    // Sizes live in the central directory when bit 3 is set.
    for (let i = view.byteLength - 46; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x02014b50) {
        compSize = view.getUint32(i + 20, true);
        break;
      }
    }
  }
  const data = new Uint8Array(buf, start, compSize);
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new PaidMediaAdapterError("bing", "API_ERROR", `unsupported zip method ${method}`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** RFC-4180-ish CSV → rows of cells (quotes + doubled quotes handled). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Report CSV → InsightRows (filtered to `externalIds` when given). */
export function reportCsvToRows(csv: string, query: InsightsQuery): InsightRow[] {
  const [header, ...body] = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (!header) return [];
  const col = (name: string) => header.indexOf(name);
  const idCol = col(REPORT_SHAPE[query.resourceKind].idColumn);
  const want = query.externalIds?.length ? new Set(query.externalIds) : null;
  const out: InsightRow[] = [];
  for (const r of body) {
    const externalId = r[idCol] ?? "";
    if (!externalId || (want && !want.has(externalId))) continue;
    const raw = Object.fromEntries(header.map((h, i) => [h, r[i]]));
    out.push({
      externalId,
      resourceKind: query.resourceKind,
      date: r[col("TimePeriod")] ?? query.since,
      impressions: num(r[col("Impressions")]),
      clicks: num(r[col("Clicks")]),
      spendCents: Math.round(num(r[col("Spend")]) * 100),
      conversions: Math.round(num(r[col("Conversions")])),
      videoViews: 0,
      rawMetrics: raw,
    });
  }
  return out;
}

// ── submit / poll / download, one step per call ───────────────────────────

export async function pullBingInsights(
  call: BingReportingCall,
  download: BingDownload,
  accountId: string,
  query: InsightsQuery,
): Promise<InsightsResult> {
  let reportRequestId = query.pendingReportId;
  if (!reportRequestId) {
    const submitted = await call("/GenerateReport/Submit", buildReportRequest(accountId, query));
    reportRequestId = submitted?.ReportRequestId;
    if (!reportRequestId) throw new PaidMediaAdapterError("bing", "API_ERROR", "Report submit returned no ReportRequestId", submitted);
  }
  const polled = await call("/GenerateReport/Poll", { ReportRequestId: reportRequestId });
  const status = polled?.ReportRequestStatus?.Status;
  if (status === "Pending") return { pending: true, reportRequestId };
  if (status !== "Success") {
    throw new PaidMediaAdapterError("bing", "API_ERROR", `Report ${reportRequestId} failed (${status ?? "unknown"})`, polled);
  }
  const url = polled.ReportRequestStatus.ReportDownloadUrl as string | null | undefined;
  if (!url) return []; // Success with no URL = no data in range.
  return reportCsvToRows(await unzipFirstEntry(await download(url)), query);
}
