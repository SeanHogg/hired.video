/**
 * Recent-request ring buffer for error diagnostics (copied into error reports
 * and the SuperAdmin diagnostics panel). Bodies are capped so the buffer can
 * never balloon and /api/errors/report stays under its payload cap.
 */

export interface ApiRequestLogEntry {
  id: number;
  method: string;
  url: string;
  requestBody?: unknown;
  status?: number;
  responseBody?: unknown;
  error?: string;
  timestamp: string;
  durationMs?: number;
}

const MAX_LOG_ENTRIES = 10;
// Cap each body at ~2KB so the ring buffer can never balloon (e.g. a single
// resume fetch returning 100KB+) and so /api/errors/report stays under its
// 64KB payload cap. Error envelopes are well under this; success bodies get
// a JSON-stringified preview.
const MAX_BODY_BYTES_FOR_LOG = 2048;
let _logIdCounter = 0;

/** Next monotonically increasing log-entry id. */
export function nextLogId(): number {
  return ++_logIdCounter;
}
const _recentApiRequests: ApiRequestLogEntry[] = [];
const _evictedApiFailures: ApiRequestLogEntry[] = [];
/** Requests still waiting for an answer. Kept apart from the ring so a slow
 *  one (a publish, an upload) is never pushed out by the polling that runs
 *  while it waits — it is exactly what a diagnostics report needs to show. */
const _pendingApiRequests = new Map<number, ApiRequestLogEntry>();

export function truncateBodyForLog(body: unknown): unknown {
  if (body == null) return body;
  let json: string;
  try {
    json = JSON.stringify(body);
  } catch {
    return "[unserializable]";
  }
  if (json.length <= MAX_BODY_BYTES_FOR_LOG) return body;
  return {
    _truncated: true,
    _originalBytes: json.length,
    _preview: json.slice(0, MAX_BODY_BYTES_FOR_LOG),
  };
}

export function pushApiLogEntry(entry: ApiRequestLogEntry): void {
  if (entry.requestBody !== undefined) {
    entry.requestBody = truncateBodyForLog(entry.requestBody);
  }
  _recentApiRequests.push(entry);
  _pendingApiRequests.set(entry.id, entry);
  if (_recentApiRequests.length > MAX_LOG_ENTRIES) {
    const evicted = _recentApiRequests.shift();
    // A failure outlives the busy successes that follow it, so a report
    // copied a minute later still shows what broke.
    if (evicted && isFailedLogEntry(evicted)) {
      _evictedApiFailures.push(evicted);
      if (_evictedApiFailures.length > MAX_LOG_ENTRIES) _evictedApiFailures.shift();
    }
  }
}

export function isFailedLogEntry(entry: ApiRequestLogEntry): boolean {
  return entry.error !== undefined || (entry.status !== undefined && entry.status >= 400);
}

function findLogEntry(id: number): ApiRequestLogEntry | undefined {
  return _pendingApiRequests.get(id) ?? _recentApiRequests.find((e) => e.id === id);
}

/** The request failed without a response (transport error, timeout, a
 *  rejected body). `firstOnly`: keep an answer already recorded. */
export function recordLogEntryError(id: number, message: string, startTime: number, firstOnly = true): void {
  const entry = findLogEntry(id);
  _pendingApiRequests.delete(id);
  if (!entry || (firstOnly && entry.durationMs)) return;
  entry.error = message;
  entry.durationMs = Date.now() - startTime;
}

export function recordLogEntryResponse(
  id: number,
  status: number,
  body: unknown,
  startTime: number,
): void {
  const entry = findLogEntry(id);
  _pendingApiRequests.delete(id);
  if (entry) {
    entry.status = status;
    entry.responseBody = truncateBodyForLog(body);
    entry.durationMs = Date.now() - startTime;
  }
}

/** Returns a snapshot of the most recent API requests/responses for error diagnostics. */
export function getRecentApiRequests(): ApiRequestLogEntry[] {
  return [..._recentApiRequests];
}

/** Requests sent but not answered yet, oldest first, with how long each has
 *  been waiting — a post stuck on "Posting…" shows up here. */
export function getPendingApiRequests(): Array<ApiRequestLogEntry & { waitingMs: number }> {
  const now = Date.now();
  return [..._pendingApiRequests.values()].map((e) => ({ ...e, waitingMs: now - Date.parse(e.timestamp) }));
}

/** The last failed requests (4xx/5xx or transport errors), oldest first —
 *  kept even after newer requests push them out of the recent log. */
export function getRecentApiFailures(): ApiRequestLogEntry[] {
  return [..._evictedApiFailures, ..._recentApiRequests.filter(isFailedLogEntry)].slice(-MAX_LOG_ENTRIES);
}
