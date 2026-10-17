/**
 * PitchRepository — data access for the "current video pitch" pointer
 * (#1237 / #2133).
 *
 * A pitch is a `studio_projects` row with `purpose = 'pitch'`;
 * its media is the latest linked `studio_recordings` take (the row the
 * recording upload writes). `studio_projects.is_current_pitch` is the
 * per-user singleton guarded by `uq_studio_projects_current_pitch_per_user`.
 *
 * Every read is batch-shaped (`userIds[]`) so list surfaces (pipeline
 * kanban, partner payloads) resolve all pitches in ONE query.
 */

import { and, desc, eq, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import { activeGrantConditions } from "../services/studio/workspace.js";

const { studioProjects, studioRecordings, userProfiles, users, workspaceGrants } = schema;

export type DbLike = any;

/** One (project, take) pair — newest take first per user. */
export interface CurrentPitchRow {
  userId: string;
  projectId: string;
  videoUrl: string | null;
  durationMs: number | null;
  recordedAt: Date | string | null;
}

/** A current-pitch take joined with what decides its visibility: the
 *  owner's stored profile-section overrides (raw
 *  `user_profiles.profile_sections`) and role (the section defaults). */
export interface ProfilePitchRow extends CurrentPitchRow {
  profileSections: unknown;
  role: string | null;
}

export interface PitchProjectRow {
  id: string;
  userId: string;
  companyId: string | null;
  purpose: string | null;
  isCurrentPitch: boolean;
}

export interface IPitchRepository {
  /** Every counted take (`countedPitchTake`) of every CURRENT pitch for the
   *  given users, newest first. */
  findCurrentForUsers(userIds: string[]): Promise<CurrentPitchRow[]>;
  /** Every take of every CURRENT pitch for the given users, newest first,
   *  each carrying its owner's stored profile-section overrides + role (two
   *  joins in the same query — no extra round-trip). Users with no current
   *  pitch have no rows. */
  findCurrentForProfiles(userIds: string[]): Promise<ProfilePitchRow[]>;
  findProject(projectId: string): Promise<PitchProjectRow | null>;
  /** True when the project has at least one counted take (see
   *  `countedPitchTake`) with a durable URL. */
  hasRecording(projectId: string): Promise<boolean>;
  /** Clear the user's other current pitch, then mark `projectId` current. */
  setCurrent(userId: string, projectId: string): Promise<void>;
  clearCurrent(userId: string): Promise<void>;
}

/** Recording ↔ project join. `studio_recordings.project_id` is text (legacy
 *  0-series table), so compare against the uuid cast to text — the
 *  `idx_studio_recordings_project` index still serves it. */
const recordingOfProject = sql`${studioRecordings.projectId} = ${studioProjects.id}::text`;

/**
 * Take attribution (#2391 hardening) — a take counts toward a pitch only
 * when it was recorded by the project's owner, or by a delegate holding an
 * active "studio" workspace grant from that owner: the personal-side
 * `canActFor` rule the recording upload enforces before linking a take
 * (services/studio/recordingProjectAccess.ts). Pitch projects are always
 * personal (`setCurrentPitch` rejects company projects), so the company
 * branch never applies. Defence in depth: a take linked to someone else's
 * project (pre-fix rows, or a grant since revoked) never becomes their
 * pitch. `studio_recordings.user_id` is text (legacy table), so the uuid
 * sides are cast to text.
 */
export function countedPitchTake(): SQL {
  return or(
    sql`${studioRecordings.userId} = ${studioProjects.userId}::text`,
    // Explicit parens: drizzle's exists() does not wrap a raw sql`` operand.
    sql`exists (select 1 from ${workspaceGrants} where ${and(
      eq(workspaceGrants.subjectUserId, studioProjects.userId),
      sql`${workspaceGrants.contributorUserId}::text = ${studioRecordings.userId}`,
      activeGrantConditions("studio"),
    )})`,
  )!;
}

export class PitchRepository implements IPitchRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findCurrentForUsers(userIds: string[]): Promise<CurrentPitchRow[]> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return [];
    return (await this.db
      .select({
        userId: studioProjects.userId,
        projectId: studioProjects.id,
        videoUrl: studioRecordings.videoUrl,
        durationMs: studioRecordings.durationMs,
        recordedAt: studioRecordings.createdAt,
      })
      .from(studioProjects)
      .innerJoin(studioRecordings, recordingOfProject)
      .where(and(
        inArray(studioProjects.userId, ids),
        eq(studioProjects.isCurrentPitch, true),
        isNotNull(studioRecordings.videoUrl),
        countedPitchTake(),
      ))
      .orderBy(desc(studioRecordings.createdAt))) as CurrentPitchRow[];
  }

  async findCurrentForProfiles(userIds: string[]): Promise<ProfilePitchRow[]> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return [];
    return (await this.db
      .select({
        userId: studioProjects.userId,
        projectId: studioProjects.id,
        videoUrl: studioRecordings.videoUrl,
        durationMs: studioRecordings.durationMs,
        recordedAt: studioRecordings.createdAt,
        profileSections: userProfiles.profileSections,
        role: users.role,
      })
      .from(studioProjects)
      .innerJoin(studioRecordings, recordingOfProject)
      .innerJoin(users, eq(users.id, studioProjects.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, studioProjects.userId))
      .where(and(
        inArray(studioProjects.userId, ids),
        eq(studioProjects.isCurrentPitch, true),
        isNotNull(studioRecordings.videoUrl),
        countedPitchTake(),
      ))
      .orderBy(desc(studioRecordings.createdAt))) as ProfilePitchRow[];
  }

  async findProject(projectId: string): Promise<PitchProjectRow | null> {
    const [row] = await this.db
      .select({
        id: studioProjects.id,
        userId: studioProjects.userId,
        companyId: studioProjects.companyId,
        purpose: studioProjects.purpose,
        isCurrentPitch: studioProjects.isCurrentPitch,
      })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    return (row as PitchProjectRow | undefined) ?? null;
  }

  async hasRecording(projectId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: studioRecordings.id })
      .from(studioRecordings)
      .innerJoin(studioProjects, recordingOfProject)
      .where(and(
        eq(studioProjects.id, projectId),
        isNotNull(studioRecordings.videoUrl),
        countedPitchTake(),
      ))
      .limit(1);
    return Boolean(row);
  }

  async setCurrent(userId: string, projectId: string): Promise<void> {
    // Two statements (the neon-http driver has no interactive transactions):
    // roll off the sibling first so the partial unique index never sees two
    // true rows, then promote. Same ordering as the profile-primary flip in
    // PATCH /api/studio/projects/:id ({ status }).
    const at = this.now();
    await this.db
      .update(studioProjects)
      .set({ isCurrentPitch: false, updatedAt: at })
      .where(and(
        eq(studioProjects.userId, userId),
        eq(studioProjects.isCurrentPitch, true),
        ne(studioProjects.id, projectId),
      ));
    await this.db
      .update(studioProjects)
      .set({ isCurrentPitch: true, updatedAt: at })
      .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)));
  }

  async clearCurrent(userId: string): Promise<void> {
    await this.db
      .update(studioProjects)
      .set({ isCurrentPitch: false, updatedAt: this.now() })
      .where(and(eq(studioProjects.userId, userId), eq(studioProjects.isCurrentPitch, true)));
  }
}
