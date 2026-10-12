/**
 * Shared AI Posting Agent helpers (#2300).
 *
 * Pure functions the planner, the Hub, and unit tests all share: quiet
 * hours, cadence slots (incl. DST), clip picking, project rotation, and
 * the per-network daily cap. No I/O.
 */
import {
  AGENT_CADENCES as AGENT_CADENCE,
  AGENT_CLIP_SECONDS,
  AGENT_COOLDOWN_DAYS,
  AGENT_UNDO_WINDOW_MIN,
  AGENT_YOUTUBE_DAILY_MAX,
  isNetworkDestination,
  type AgentCadence,
  type DistributionDestination,
} from "./social-publish-jobs.js";

export { AGENT_CADENCE };

/** Windows scoring below this are never posted. */
export const AGENT_MIN_WINDOW_SCORE = 0.4;
/** Skip a window that overlaps an already-posted one by more than this. */
export const AGENT_MAX_OVERLAP = 0.5;
/** Snap the window start to a scene boundary within this many seconds. */
export const AGENT_SCENE_SNAP_SEC = 2;
/** Post the whole video when it is this short or shorter (no cut). */
export const AGENT_WHOLE_VIDEO_MAX_SEC = 45;
/** Default quiet hours: 21:00–08:00 local. */
export const AGENT_DEFAULT_QUIET_START = 21 * 60;
export const AGENT_DEFAULT_QUIET_END = 8 * 60;
/** Default post time: 12:00 local. */
export const AGENT_DEFAULT_POST_MINUTE = 12 * 60;

export type HighlightWindow = {
  startSecond: number;
  endSecond: number;
  score: number;
};

/** ISO weekday: 0 Sun … 6 Sat, matching `Date.getUTCDay()`. */
export const AGENT_CADENCE_WEEKDAYS: Record<AgentCadence, readonly number[]> = {
  light: [2],
  steady: [1, 3, 5],
  daily: [1, 2, 3, 4, 5],
};

/** Overlap of two windows as a fraction of the shorter one's length. */
export function windowOverlapRatio(a: HighlightWindow, b: HighlightWindow): number {
  const overlap = Math.max(0, Math.min(a.endSecond, b.endSecond) - Math.max(a.startSecond, b.startSecond));
  const shorter = Math.min(a.endSecond - a.startSecond, b.endSecond - b.startSecond);
  return shorter > 0 ? overlap / shorter : 0;
}

/**
 * Highest-scoring window of at least `clipSec` (or 5s, whichever is smaller)
 * that does not overlap an already-posted window by more than 50%.
 * Windows scoring below 0.4 are skipped.
 */
export function pickFreshWindow(
  windows: HighlightWindow[],
  clipSec: number,
  used: readonly HighlightWindow[],
): HighlightWindow | null {
  const minDur = Math.min(5, clipSec);
  const ranked = windows
    .filter((w) => w.score >= AGENT_MIN_WINDOW_SCORE)
    .filter((w) => w.endSecond - w.startSecond >= minDur)
    .filter((w) => used.every((u) => windowOverlapRatio(w, u) <= AGENT_MAX_OVERLAP))
    .sort((a, b) => b.score - a.score || a.startSecond - b.startSecond);
  return ranked[0] ?? null;
}

/** Snap `startSec` to the nearest scene boundary within `snapSec`. */
export function snapToScene(
  startSec: number,
  sceneStarts: readonly number[],
  snapSec = AGENT_SCENE_SNAP_SEC,
): number {
  let best = startSec;
  let bestDist = snapSec;
  for (const s of sceneStarts) {
    const d = Math.abs(s - startSec);
    if (d <= bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/** Whole video if ≤ 45s, else the 30s agent clip. */
export function clipSecondsForMaster(masterSec: number, targetSec = AGENT_CLIP_SECONDS): number {
  if (masterSec <= AGENT_WHOLE_VIDEO_MAX_SEC) return masterSec;
  return targetSec;
}

/**
 * Candidate windows when highlight_cuts are missing: the whole video if it
 * is short enough, otherwise sliding `clipSec` slices scored just above the
 * 0.4 floor so pickFreshWindow can still rotate through unused ranges.
 */
export function windowsFromDuration(durationSec: number, clipSec = AGENT_CLIP_SECONDS): HighlightWindow[] {
  if (!(durationSec > 0)) return [];
  if (durationSec <= AGENT_WHOLE_VIDEO_MAX_SEC) {
    return [{ startSecond: 0, endSecond: durationSec, score: 1 }];
  }
  const windows: HighlightWindow[] = [];
  const step = Math.max(5, clipSec / 2);
  for (let start = 0; start < durationSec; start += step) {
    const end = Math.min(start + clipSec, durationSec);
    if (end - start < Math.min(5, clipSec)) break;
    windows.push({ startSecond: start, endSecond: end, score: 0.5 });
  }
  return windows;
}

/**
 * Pick a fresh window and snap its start to a scene boundary (within 2s).
 * Length is preserved so a 30s clip stays 30s after the snap.
 */
export function selectAgentClip(
  windows: HighlightWindow[],
  used: readonly HighlightWindow[],
  clipSec: number,
  sceneStarts: readonly number[] = [],
): HighlightWindow | null {
  const picked = pickFreshWindow(windows, clipSec, used);
  if (!picked) return null;
  const start = snapToScene(picked.startSecond, sceneStarts);
  const duration = picked.endSecond - picked.startSecond;
  return { startSecond: start, endSecond: start + duration, score: picked.score };
}

/** Videos store duration as seconds; a few rows are milliseconds. */
export function normalizeVideoDurationSec(raw: number | null | undefined): number {
  if (raw == null || !(raw > 0)) return 0;
  return raw > 10_000 ? raw / 1000 : raw;
}

/** Variant key with optional start, e.g. `9x16-30s45`. */
export function variantKeyForClip(aspect: string, clipSec: number, startSec?: number | null): string {
  if (startSec == null) return `${aspect}-${clipSec}s`;
  return `${aspect}-${clipSec}s${Math.round(startSec)}`;
}

export interface ProjectRotationInput {
  projectId: string;
  /** Null = never posted by the agent → counts as oldest. */
  lastAgentPostedAt: Date | null;
  lastPublishedAt: Date;
}

/** Oldest agent-post first; never-posted counts as oldest; ties by most recent publish. */
export function rotateProjects(projects: readonly ProjectRotationInput[]): ProjectRotationInput[] {
  return [...projects].sort((a, b) => {
    const aT = a.lastAgentPostedAt?.getTime() ?? 0;
    const bT = b.lastAgentPostedAt?.getTime() ?? 0;
    if (aT !== bT) return aT - bT;
    return b.lastPublishedAt.getTime() - a.lastPublishedAt.getTime();
  });
}

export function isInCooldown(
  lastPostedAt: Date | null,
  now: Date,
  cooldownDays = AGENT_COOLDOWN_DAYS,
): boolean {
  if (!lastPostedAt) return false;
  return now.getTime() - lastPostedAt.getTime() < cooldownDays * 24 * 60 * 60 * 1000;
}

/**
 * True when `minuteOfDay` (0–1439, local) falls inside quiet hours.
 * Wrapping windows (e.g. 21:00–08:00) are supported.
 */
export function isInQuietHours(
  minuteOfDay: number,
  quietStart: number,
  quietEnd: number,
): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) {
    return minuteOfDay >= quietStart && minuteOfDay < quietEnd;
  }
  return minuteOfDay >= quietStart || minuteOfDay < quietEnd;
}

/** Next plan time: `from` plus one cadence period (light = 7d, steady = ~2.3d, daily = 1d). */
export function computeNextPlanTime(from: Date, cadence: AgentCadence): Date {
  const days = cadence === "light" ? 7 : cadence === "daily" ? 1 : 2;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** YouTube 3/day; every other destination 1/local-day. */
export function isWithinDailyLimit(count: number, destination: string): boolean {
  const max = destination === "youtube" ? AGENT_YOUTUBE_DAILY_MAX : 1;
  return count < max;
}

/**
 * TikTok stays "post it yourself" until the Content Posting audit passes.
 * Pass `true` only after the audit flag is on.
 */
export function isTikTokReady(auditPassed = false): boolean {
  return auditPassed === true;
}

// ─── Cadence slots in a timezone (DST-safe via Intl) ─────────────────────────

function tzParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(map.weekday);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    weekday,
  };
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return asUtc - date.getTime();
}

/** Instant for local Y-M-D + minute-of-day in `timeZone` (handles DST). */
export function zonedLocalDate(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const d1 = new Date(utcGuess - tzOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - tzOffsetMs(d1, timeZone));
}

/**
 * Cadence slot instants in `[from, to)` at `postMinute` local in `timeZone`.
 * Light = Tuesday, Steady = Mon/Wed/Fri, Daily = Mon–Fri.
 */
export function slotsForWeek(
  cadence: AgentCadence,
  postMinute: number,
  timeZone: string,
  from: Date,
  to: Date,
): Date[] {
  const days = AGENT_CADENCE_WEEKDAYS[cadence];
  const slots: Date[] = [];
  const seen = new Set<string>();
  const cursor = new Date(from.getTime() - 36 * 60 * 60 * 1000);
  const end = new Date(to.getTime() + 36 * 60 * 60 * 1000);
  for (let t = cursor.getTime(); t <= end.getTime(); t += 12 * 60 * 60 * 1000) {
    const p = tzParts(new Date(t), timeZone);
    if (!days.includes(p.weekday)) continue;
    const slot = zonedLocalDate(p.year, p.month, p.day, postMinute, timeZone);
    const key = slot.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    if (slot >= from && slot < to) slots.push(slot);
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/** Push a retry past the end of quiet hours (local minute-of-day + tz). */
export function endOfQuietHours(
  from: Date,
  quietEndMinute: number,
  timeZone: string,
): Date {
  const p = tzParts(from, timeZone);
  const todayEnd = zonedLocalDate(p.year, p.month, p.day, quietEndMinute, timeZone);
  if (todayEnd > from) return todayEnd;
  const next = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const n = tzParts(next, timeZone);
  return zonedLocalDate(n.year, n.month, n.day, quietEndMinute, timeZone);
}

/** True when an approved agent job is still inside the 10-minute undo window. */
export function canUndoAgentApproval(status: string, updatedAt: Date, now: Date): boolean {
  return status === "scheduled" && now.getTime() - updatedAt.getTime() < AGENT_UNDO_WINDOW_MIN * 60 * 1000;
}

/**
 * Next local post slot at `postMinute`, shifted to the end of quiet hours
 * when that clock time falls inside them.
 */
export function nextPostSlot(
  now: Date,
  postMinute: number,
  quietStart: number,
  quietEnd: number,
  timeZone: string,
): Date {
  const p = tzParts(now, timeZone);
  let candidate = zonedLocalDate(p.year, p.month, p.day, postMinute, timeZone);
  if (candidate.getTime() <= now.getTime()) {
    const next = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    const n = tzParts(next, timeZone);
    candidate = zonedLocalDate(n.year, n.month, n.day, postMinute, timeZone);
  }
  const c = tzParts(candidate, timeZone);
  if (isInQuietHours(c.hour * 60 + c.minute, quietStart, quietEnd)) {
    return endOfQuietHours(candidate, quietEnd, timeZone);
  }
  return candidate;
}

/**
 * Retry instant, pushed to the end of quiet hours when it would land inside
 * them. Used by the drainer so a failed agent post doesn't retry at 2am.
 */
export function computeRetryAt(
  now: Date,
  delayMs: number,
  quietStart: number = AGENT_DEFAULT_QUIET_START,
  quietEnd: number = AGENT_DEFAULT_QUIET_END,
  timeZone: string = "UTC",
): Date {
  const retryAt = new Date(now.getTime() + delayMs);
  const p = tzParts(retryAt, timeZone);
  if (isInQuietHours(p.hour * 60 + p.minute, quietStart, quietEnd)) {
    return endOfQuietHours(retryAt, quietEnd, timeZone);
  }
  return retryAt;
}

/** Start of the local calendar day for `at` in `timeZone`. */
export function localDayStart(at: Date, timeZone: string): Date {
  const p = tzParts(at, timeZone);
  return zonedLocalDate(p.year, p.month, p.day, 0, timeZone);
}

/** Monday 00:00 local of the ISO week containing `at`. */
export function localWeekStart(at: Date, timeZone: string): Date {
  const p = tzParts(at, timeZone);
  const daysFromMonday = (p.weekday + 6) % 7;
  const midnight = zonedLocalDate(p.year, p.month, p.day, 0, timeZone);
  const monday = new Date(midnight.getTime() - daysFromMonday * 86_400_000);
  const m = tzParts(monday, timeZone);
  return zonedLocalDate(m.year, m.month, m.day, 0, timeZone);
}

/** Truncate a caption to the destination's character cap. */
export function fitCaption(caption: string, maxLength: number): string {
  if (caption.length <= maxLength) return caption;
  if (maxLength <= 1) return caption.slice(0, Math.max(0, maxLength));
  return `${caption.slice(0, maxLength - 1)}…`;
}

/** Prompt-side cap for clip-window transcript (R17). */
export const AGENT_TRANSCRIPT_MAX_CHARS = 1500;

export type TimedWord = { word: string; start: number; end: number };

/**
 * Join timed words whose interval overlaps `[startSec, endSec]`.
 * Caps at `maxChars` on a word boundary when possible; an empty window is `""`.
 */
export function transcriptForClip(
  words: TimedWord[],
  startSec: number,
  endSec: number,
  maxChars = AGENT_TRANSCRIPT_MAX_CHARS,
): string {
  if (!(maxChars > 0) || !(endSec > startSec)) return "";
  const overlapping = words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > startSec && w.start < endSec)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (overlapping.length === 0) return "";

  const parts: string[] = [];
  let len = 0;
  for (const w of overlapping) {
    const token = w.word.trim();
    if (!token) continue;
    const extra = parts.length === 0 ? token.length : token.length + 1;
    if (len + extra <= maxChars) {
      parts.push(token);
      len += extra;
      continue;
    }
    if (parts.length === 0) return token.slice(0, maxChars);
    break;
  }
  return parts.join(" ");
}

/** Push notifications stay silent during quiet hours. */
export function shouldSendAgentPush(
  minuteOfDay: number,
  quietStart: number = AGENT_DEFAULT_QUIET_START,
  quietEnd: number = AGENT_DEFAULT_QUIET_END,
): boolean {
  return !isInQuietHours(minuteOfDay, quietStart, quietEnd);
}

/**
 * Agent network posts must name a prepared `render_variant_id` (R16).
 * Feed posts and `postYourself` overflow do not — they never upload a cut.
 */
export function agentJobNeedsPreparedClip(job: {
  source?: string | null;
  destination: string;
  renderVariantId?: string | null;
  postYourself?: boolean;
}): boolean {
  if (job.source !== "agent") return false;
  if (job.postYourself) return false;
  if (!isNetworkDestination(job.destination as DistributionDestination)) return false;
  return !job.renderVariantId;
}
