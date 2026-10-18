/**
 * PitchService — "set as my pitch" + the batch read every candidate
 * surface embeds (#1237 / #2133).
 *
 * Rules:
 *   • A pitch is a studio project with `purpose: "pitch"` owned by the user
 *     personally (not a company workspace project).
 *   • It must have at least one recorded take with a durable URL.
 *   • At most one current pitch per user: the repository rolls off the
 *     sibling before promoting, and the partial unique index
 *     `uq_studio_projects_current_pitch_per_user` is the hard backstop. A
 *     concurrent set that loses the race (23505) is retried once.
 *
 * Reads are batch-shaped — one query for any number of users, so list DTOs
 * never N+1. Third-party surfaces read through `getVisiblePitches` /
 * `getProfilePitch` (section visibility, #2391); only the owner's own reads
 * use `getCurrentPitch(es)`.
 */

import { PITCH_PURPOSE, type PitchSummary } from "../../../../shared/pitch.js";
import {
  isProfileSectionVisible,
  type StoredProfileSections,
} from "../../../../shared/profile-sections.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import { getDb } from "../../db/index.js";
import { invalidatePartnerProfilesForUser } from "../partner/connections.js";
import {
  PitchRepository,
  type CurrentPitchRow,
  type IPitchRepository,
  type ProfilePitchRow,
} from "../../repositories/pitchRepository.js";
import { DomainError } from "../../domains/errors.js";

export type PitchErrorCode = "NOT_FOUND" | "FORBIDDEN" | "NOT_A_PITCH" | "NO_MEDIA";

const PITCH_ERROR_STATUS: Record<PitchErrorCode, 400 | 403 | 404 | 409> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOT_A_PITCH: 400,
  NO_MEDIA: 409,
};

export class PitchError extends DomainError {
  declare readonly code: PitchErrorCode;
  constructor(code: PitchErrorCode, message: string) {
    super(PITCH_ERROR_STATUS[code], code, message);
    this.name = "PitchError";
  }
}

/** Production wiring for callers that don't already hold a `Repos`. */
export function defaultPitchRepository(): IPitchRepository {
  return new PitchRepository(getDb());
}

function toIso(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Pure: collapse repository rows (every take of every current pitch, newest
 * first) into one `PitchSummary` per user — the newest take with a URL wins.
 * Order-independent: picks by `recordedAt` rather than trusting row order.
 */
export function toPitchSummaries(rows: CurrentPitchRow[]): Map<string, PitchSummary> {
  const out = new Map<string, PitchSummary>();
  for (const row of rows) {
    if (!row.videoUrl) continue;
    const candidate: PitchSummary = {
      projectId: row.projectId,
      videoUrl: row.videoUrl,
      durationMs: row.durationMs ?? null,
      recordedAt: toIso(row.recordedAt),
    };
    const prev = out.get(row.userId);
    if (!prev || (candidate.recordedAt ?? "") > (prev.recordedAt ?? "")) {
      out.set(row.userId, candidate);
    }
  }
  return out;
}

/** A pitch shows the candidate's face and voice, so a redacted share (e.g.
 *  SharedCandidateResume) may embed it only when the redaction keeps both
 *  the name and the avatar visible. Default redaction hides both → no pitch. */
export function pitchAllowedUnderRedaction(rules: { hideName: boolean; hideAvatar: boolean }): boolean {
  return !rules.hideName && !rules.hideAvatar;
}

/**
 * Pitch visibility (#2391) — the ONE rule every surface that shows a user's
 * pitch to someone else goes through. The pitch rides the owner's
 * "videoResume" profile section (shared/profile-sections.ts: role defaults
 * merged with the stored `user_profiles.profile_sections` overrides), the
 * same toggle the page's <PitchSection> self-gates on — now enforced on the
 * server so a hidden pitch URL never leaves the API.
 *
 * What "hidden" means per surface:
 *   • Public profile — GET /users/:id, /u/:handle (`getProfilePitch`): the
 *     owner always sees their own pitch (so they can manage it); every other
 *     viewer, signed in or not, gets `pitch: null`.
 *   • Shared candidate résumé (candidates.ts, `/shared/:token`): the viewer
 *     is a hiring manager, never the candidate, so the section must be
 *     visible AND the share's redaction must keep identity visible
 *     (`pitchAllowedUnderRedaction`).
 *   • Recruiter pipeline card + hiring-manager share portal
 *     (PipelineService.candidateSignals): section visible; confidential
 *     masking may then null it too.
 *   • Partner payload (partner/jobSeekers.ts `videoPitchUrl`): the partner
 *     republishes the profile to its own audience — section visible.
 *   • The owner's own reads (GET /video-pitch, set-as-pitch) stay unfiltered
 *     through `getCurrentPitch` / `getCurrentPitches`.
 */
export function pitchVisibleOnProfile(stored: unknown, role: string | null | undefined): boolean {
  const overrides = stored && typeof stored === "object" ? (stored as StoredProfileSections) : null;
  return isProfileSectionVisible(overrides, role, "videoResume");
}

/** Pure: profile-joined pitch rows → summaries for the users whose
 *  "videoResume" section is visible (`role` falls back to each row's). */
export function toVisiblePitchSummaries(
  rows: ProfilePitchRow[],
  opts: { role?: string | null; ownerId?: string | null } = {},
): Map<string, PitchSummary> {
  const visible = rows.filter(
    (r) => (opts.ownerId && r.userId === opts.ownerId) || pitchVisibleOnProfile(r.profileSections, opts.role ?? r.role),
  );
  return toPitchSummaries(visible);
}

/** Current pitches of many users as a third party sees them (pipeline,
 *  shared résumé, partner payload): hidden "videoResume" sections dropped.
 *  One query for the whole page. */
export async function getVisiblePitches(
  userIds: string[],
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<Map<string, PitchSummary>> {
  if (userIds.length === 0) return new Map();
  return toVisiblePitchSummaries(await repo.findCurrentForProfiles(userIds));
}

export async function getVisiblePitch(
  userId: string,
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<PitchSummary | null> {
  return (await getVisiblePitches([userId], repo)).get(userId) ?? null;
}

/** The owner's current pitch for a public profile surface, or null when
 *  there is none or the owner hid the "videoResume" section — unless the
 *  viewer IS the owner. One query (pitch takes joined with the owner's
 *  stored section overrides). */
export async function getProfilePitch(
  user: { id: string; role: string | null },
  repo: IPitchRepository = defaultPitchRepository(),
  viewer: { isOwner?: boolean } = {},
): Promise<PitchSummary | null> {
  const rows = await repo.findCurrentForProfiles([user.id]);
  const ownerId = viewer.isOwner ? user.id : null;
  return toVisiblePitchSummaries(rows, { role: user.role, ownerId }).get(user.id) ?? null;
}

export async function getCurrentPitches(
  userIds: string[],
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<Map<string, PitchSummary>> {
  if (userIds.length === 0) return new Map();
  return toPitchSummaries(await repo.findCurrentForUsers(userIds));
}

export async function getCurrentPitch(
  userId: string,
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<PitchSummary | null> {
  return (await getCurrentPitches([userId], repo)).get(userId) ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "23505" || (err instanceof Error && /unique|duplicate key/i.test(err.message));
}

/** Make `projectId` the user's one current pitch. Returns the new summary. */
export async function setCurrentPitch(
  userId: string,
  projectId: string,
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<PitchSummary> {
  const project = await repo.findProject(projectId);
  if (!project) throw new PitchError("NOT_FOUND", "Project not found");
  if (project.userId !== userId || project.companyId) {
    throw new PitchError("FORBIDDEN", "Only your own personal pitch can be set");
  }
  if (project.purpose !== PITCH_PURPOSE) {
    throw new PitchError("NOT_A_PITCH", "Only a pitch project can be set as your pitch");
  }
  if (!(await repo.hasRecording(projectId))) {
    throw new PitchError("NO_MEDIA", "Record your pitch before setting it");
  }

  try {
    await repo.setCurrent(userId, projectId);
  } catch (err) {
    // Another request promoted a different project between our roll-off and
    // promote — roll off again and retry once.
    if (!isUniqueViolation(err)) throw err;
    await repo.setCurrent(userId, projectId);
  }

  const summary = await getCurrentPitch(userId, repo);
  if (!summary) throw new PitchError("NO_MEDIA", "Record your pitch before setting it");
  return summary;
}

export async function clearCurrentPitch(
  userId: string,
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<void> {
  await repo.clearCurrent(userId);
}

/** PUT /api/video-pitch/current — set (or with `null`, clear) the user's
 *  current pitch, then bust every cache that embeds it (the partner payload
 *  is read-through cached). Returns the new summary, or null when cleared. */
export async function updateCurrentPitch(
  userId: string,
  projectId: string | null,
  repo: IPitchRepository = defaultPitchRepository(),
): Promise<PitchSummary | null> {
  if (projectId === null) {
    await clearCurrentPitch(userId, repo);
    await invalidatePitchCaches(userId);
    return null;
  }
  const pitch = await setCurrentPitch(userId, projectId, repo);
  await invalidatePitchCaches(userId);
  return pitch;
}

// ─── Cache invalidation (#2133 / #2391) ─────────────────────────────────────

/** Busts every cache that embeds a user's pitch. Injectable for tests. */
export type PitchCacheInvalidator = (userId: string) => Promise<void>;

/**
 * The ONE invalidation every pitch write goes through. Today the only cache
 * that embeds the pitch is the partner job-seeker payload (read-through,
 * `partnerProfileCacheKey`); profile, channel, shared-résumé and pipeline
 * reads are uncached. Add any future pitch-embedding cache here.
 */
export async function invalidatePitchCaches(
  userId: string,
  invalidate: PitchCacheInvalidator = invalidatePartnerProfilesForUser,
): Promise<void> {
  await invalidate(userId);
}

/**
 * A take was added to or removed from `projectId` (POST / DELETE
 * /api/studio/recording). The shown pitch is the newest take of the CURRENT
 * pitch project, so when that project is someone's current pitch their
 * pitch caches are stale — bust them for the project's OWNER. Returns
 * whether it invalidated. `projectId` is a free-form form field, so a
 * non-uuid value is ignored rather than sent to a uuid column.
 */
export async function onPitchTakeChanged(
  projectId: string | null | undefined,
  repo: IPitchRepository = defaultPitchRepository(),
  invalidate: PitchCacheInvalidator = invalidatePartnerProfilesForUser,
): Promise<boolean> {
  if (!projectId || !UUID_LIKE_REGEX.test(projectId)) return false;
  const project = await repo.findProject(projectId);
  if (!project?.isCurrentPitch) return false;
  await invalidatePitchCaches(project.userId, invalidate);
  return true;
}
