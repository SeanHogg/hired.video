/**
 * Pure scheduling logic for ZipIntro-style back-to-back live screening
 * blocks. Splits a [startTime, endTime) window into N consecutive
 * `slotMinutes`-long slots and pairs them with the supplied candidates.
 *
 * Pure on purpose — every input is plain data, the only output is plain
 * data, no DB writes. This keeps the matching/scheduling unit testable
 * without standing up a database and lets the route layer reuse the
 * function from both the "create the schedule" handler and a
 * "preview the schedule" UI call.
 */

import { randomBase64Url } from "../../utils/crypto.js";

export interface ScheduleCandidate {
  candidateId: string | null;
  candidateName: string;
  candidateEmail?: string | null;
}

export interface ScheduledSlot {
  slotIndex: number;
  slotStart: Date;
  slotEnd: Date;
  candidate: ScheduleCandidate;
}

export interface ScheduleResult {
  slots: ScheduledSlot[];
  capacity: number;
  scheduled: number;
  unscheduled: ScheduleCandidate[];
}

/** Build back-to-back slots and pair the first N candidates with them. */
export function buildBackToBackSchedule(
  startTime: Date,
  endTime: Date,
  slotMinutes: number,
  candidates: ScheduleCandidate[],
): ScheduleResult {
  if (!(endTime > startTime)) {
    throw new Error("endTime must be after startTime");
  }
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) {
    throw new Error("slotMinutes must be a positive integer");
  }

  const slotMs = slotMinutes * 60_000;
  const totalMs = endTime.getTime() - startTime.getTime();
  const capacity = Math.floor(totalMs / slotMs);

  const slots: ScheduledSlot[] = [];
  const willSchedule = Math.min(capacity, candidates.length);
  for (let i = 0; i < willSchedule; i++) {
    slots.push({
      slotIndex: i,
      slotStart: new Date(startTime.getTime() + i * slotMs),
      slotEnd: new Date(startTime.getTime() + (i + 1) * slotMs),
      candidate: candidates[i],
    });
  }
  return {
    slots,
    capacity,
    scheduled: willSchedule,
    unscheduled: candidates.slice(willSchedule),
  };
}

/** Total number of slots a [start, end) window can hold at the given
 *  slot length. Useful for "how many invites can I send?" UI prompts. */
export function windowCapacity(
  startTime: Date,
  endTime: Date,
  slotMinutes: number,
): number {
  if (!(endTime > startTime)) return 0;
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0) return 0;
  return Math.floor((endTime.getTime() - startTime.getTime()) / (slotMinutes * 60_000));
}

/** URL-safe random token used as the public accept-invite identifier.
 *  Defaults to 32 bytes of entropy (≈43 chars base64url). */
export function generateInviteToken(bytes = 32): string {
  return randomBase64Url(bytes);
}
