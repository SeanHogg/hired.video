/**
 * "Now" or "at this time" for a post (#2047), shared by the Distribution
 * Hub and the Post dock's Schedule option. The picker edits a local
 * `datetime-local` string; the send time and its validation use the same
 * window the server enforces (shared/social-publish-jobs `scheduleProblem`).
 */
import { latestScheduleTime, scheduleProblem, type ScheduleProblem } from "@shared/social-publish-jobs";

export type ScheduleWhen = { mode: "now" } | { mode: "later"; local: string };

export const SEND_NOW: ScheduleWhen = { mode: "now" };

/** `Date` → the `datetime-local` value for the viewer's time zone. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The picker's bounds (min = now, max = 90 days out), as input values. */
export function scheduleInputBounds(now: Date): { min: string; max: string } {
  return { min: toLocalInput(now), max: toLocalInput(latestScheduleTime(now)) };
}

/** The send time a choice means (now → `now`). */
export function sendTimeOf(when: ScheduleWhen, now: Date): Date {
  return when.mode === "now" ? now : new Date(when.local);
}

/** Why the choice can't be sent, or null. "Later" with no time yet is INVALID. */
export function whenProblem(when: ScheduleWhen, now: Date): ScheduleProblem | null {
  if (when.mode === "now") return null;
  if (!when.local) return "INVALID";
  return scheduleProblem(sendTimeOf(when, now), now);
}
