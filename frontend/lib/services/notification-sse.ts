/**
 * Pure helpers for the notifications SSE poller (signalr-service.ts): SSE
 * block parsing and the `since` poll cursor. Kept framework-free so they are
 * unit-testable without a stream.
 */

const HUB_PATH = "/api/hubs/notifications";

/** One parsed SSE block: its event name and JSON-decoded data. */
export interface SseEvent {
  event: string;
  data: unknown;
}

/** Parse one double-newline-delimited SSE block; null when it carries no
 *  data line or the data isn't valid JSON. */
export function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    else if (line.startsWith("data:")) dataLines.push(line.slice(5));
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) as unknown };
  } catch {
    return null; // skip malformed data
  }
}

/** The newer of two ISO timestamps (either may be missing / unparseable),
 *  normalised to ISO. Used to advance the poll cursor monotonically. */
export function newerIso(current: string | null, candidate: string | null | undefined): string | null {
  const nextMs = candidate ? Date.parse(candidate) : NaN;
  if (!Number.isFinite(nextMs)) return current;
  const curMs = current ? Date.parse(current) : NaN;
  return !Number.isFinite(curMs) || nextMs > curMs ? new Date(nextMs).toISOString() : current;
}

/** The hub URL for a poll: a full unread burst without a cursor, else only
 *  rows created since it (an older server ignores the param). */
export function notificationsHubPath(cursor: string | null): string {
  return cursor ? `${HUB_PATH}?since=${encodeURIComponent(cursor)}` : HUB_PATH;
}

/** Whether a tab-visible event may cut the heartbeat short: only when the
 *  last poll is at least `minGapMs` old. Returns the wait (ms) otherwise. */
export function visibleRepollDelay(lastPollAt: number, now: number, minGapMs: number): number {
  const since = now - lastPollAt;
  return since >= minGapMs ? 0 : minGapMs - since;
}
