/**
 * One diagnostics report for any page, ordered for a reader triaging it:
 *
 *   1. problems — every recent API failure as one line (status, server code,
 *      message), kept even after later requests push it out of the log, and
 *      every request still waiting longer than STUCK_AFTER_MS
 *   2. requests still waiting for an answer (never pushed out by polling)
 *   3. who / where / which build (commit) / client
 *   4. the page's own state snapshot, plus the sections long-running flows
 *      report about themselves (diagnostics-sections — e.g. `postRun`)
 *   5. recent requests — method, path, status, timing; request + response
 *      bodies only for the failures
 *
 * Copied by DiagnosticsCopyButton for the developer to paste into a support
 * thread or a coding session, so it must stay pasteable: a size budget drops
 * the bulkiest parts first rather than producing a report nobody can send.
 * Developer-only (isDeveloperViewer).
 */
import {
  getPendingApiRequests,
  getRecentApiFailures,
  getRecentApiRequests,
  isFailedLogEntry,
  type ApiRequestLogEntry,
} from "@/lib/api-client";
import { readDiagnosticsSections } from "./diagnostics-sections";
import { runtimeConfig } from "@/lib/runtime-config";

export interface DiagnosticsViewer {
  id?: string;
  email?: string | null;
  role?: string | null;
}

/** Comfortably under the ~50k-character paste limits of chat tools. */
const REPORT_BUDGET_CHARS = 40_000;
/** A request unanswered this long is listed as a problem (a stuck post). */
const STUCK_AFTER_MS = 20_000;

/** The `{ success: false, error: { code, message } }` envelope, if that is what came back. */
function envelopeOf(body: unknown): { code?: string; message?: string } {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return {
    code: typeof error?.code === "string" ? error.code : undefined,
    message: typeof error?.message === "string" ? error.message : undefined,
  };
}

function pathOf(url: string): string {
  try {
    const u = new URL(url, "https://x");
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** "00:04:45 POST /api/ai/tools/resume-revise → 422 REVISE_FAILED: The AI reply wasn't a resume… (21.3s)" */
export function describeFailure(e: ApiRequestLogEntry): string {
  const { code, message } = envelopeOf(e.responseBody);
  const time = e.timestamp.slice(11, 19);
  const status = e.status ?? "network";
  const why = [code, message ?? e.error].filter(Boolean).join(": ");
  const took = e.durationMs !== undefined ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : "";
  return `${time} ${e.method} ${pathOf(e.url)} → ${status}${why ? ` ${why}` : ""}${took}`;
}

/** "03:44:47 POST /api/studio/projects/…/publish/social/youtube → still waiting (4m11s)" */
export function describeWaiting(e: ApiRequestLogEntry & { waitingMs: number }): string {
  const s = Math.round(e.waitingMs / 1000);
  const took = s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
  return `${e.timestamp.slice(11, 19)} ${e.method} ${pathOf(e.url)} → still waiting (${took})`;
}

/** Bodies only where they explain something: on failures. */
function slimRequest(e: ApiRequestLogEntry, withBodies: boolean) {
  const line = { at: e.timestamp, method: e.method, path: pathOf(e.url), status: e.status, ms: e.durationMs, error: e.error };
  return withBodies && isFailedLogEntry(e) ? { ...line, requestBody: e.requestBody, responseBody: e.responseBody } : line;
}

function compose(page: string, viewer: DiagnosticsViewer, snapshot: unknown, withBodies: boolean) {
  const pending = getPendingApiRequests();
  return {
    page,
    generatedAt: new Date().toISOString(),
    problems: [
      ...getRecentApiFailures().map(describeFailure),
      ...pending.filter((e) => e.waitingMs >= STUCK_AFTER_MS).map(describeWaiting),
    ],
    pendingApiRequests: pending.map((e) => ({
      at: e.timestamp,
      method: e.method,
      path: pathOf(e.url),
      waitingMs: e.waitingMs,
      ...(withBodies ? { requestBody: e.requestBody } : {}),
    })),
    url: typeof window !== "undefined" ? window.location.href : null,
    app: { version: runtimeConfig.version, build: runtimeConfig.build },
    viewer,
    client:
      typeof window !== "undefined"
        ? {
            userAgent: navigator.userAgent,
            language: navigator.language,
            viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
            theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            online: navigator.onLine,
          }
        : null,
    state: snapshot,
    sections: readDiagnosticsSections(),
    recentApiRequests: getRecentApiRequests().map((e) => slimRequest(e, withBodies)),
  };
}

export function buildDiagnosticsReport(page: string, viewer: DiagnosticsViewer, snapshot: unknown): string {
  const header = `hired.video diagnostics — ${page}\n\n`;
  let body = safeStringify(compose(page, viewer, snapshot, true));
  // Over budget: drop request/response bodies, then compact the JSON.
  if (body.length > REPORT_BUDGET_CHARS) body = safeStringify(compose(page, viewer, snapshot, false));
  if (body.length > REPORT_BUDGET_CHARS) body = safeStringify(compose(page, viewer, snapshot, false), 0);
  return header + body;
}

/** JSON with cycles and non-serialisable values (functions, Files) made safe. */
function safeStringify(value: unknown, indent = 2): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, v: unknown) => {
      if (typeof v === "function") return undefined;
      if (typeof File !== "undefined" && v instanceof File) return { file: v.name, type: v.type, bytes: v.size };
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[circular]";
        seen.add(v);
      }
      return v;
    },
    indent,
  );
}
