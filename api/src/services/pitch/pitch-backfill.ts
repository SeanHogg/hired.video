/**
 * Legacy pitch backfill mapping (#1237) — the unit-tested spec that
 * migration 0519_pitch_studio_projects.sql implements in SQL.
 *
 * Each user with a non-blank `users.video_pitch_url` becomes one studio
 * project (`purpose = "pitch"`, `is_current_pitch = true`) plus
 * one linked `studio_recordings` row holding the media URL — the same shape
 * `POST /api/studio/recording/upload` writes, so every pitch read path
 * (pitchRepository → PitchSummary → shared player) treats a migrated pitch
 * exactly like a freshly recorded one.
 *
 * Pure: no DB, no env. Keep it in lock-step with the SQL — if one changes,
 * change both. 0519 wrote name / purpose / revision into the storyboard
 * JSONB (`_name` / `_purpose` / `_rev`); migration 0610 promoted them to
 * columns, so the mapping now emits the post-0610 row shape.
 */

import { PITCH_PURPOSE } from "../../../../shared/pitch.js";

export const LEGACY_PITCH_PROJECT_NAME = "My video pitch";
export const LEGACY_PITCH_RECORDING_SOURCE = "legacy_video_pitch_url";
const DEFAULT_CDN_BASE = "https://cdn.hired.video";

export interface LegacyPitchUserRow {
  userId: string;
  videoPitchUrl: string | null;
  videoPitchSetAt: Date | null;
  updatedAt: Date | null;
  /** True when the user already has a current pitch project (re-run guard). */
  hasCurrentPitch: boolean;
}

export interface BackfilledPitch {
  project: {
    userId: string;
    resumeText: string;
    kind: "scene";
    mediaKind: "video";
    name: string;
    purpose: typeof PITCH_PURPOSE;
    revision: number;
    status: "draft";
    isCurrentPitch: true;
    createdAt: Date;
    updatedAt: Date;
  };
  recording: {
    userId: string;
    type: "webcam";
    videoUrl: string;
    /** R2 key when the URL is on our CDN; null for third-party hosts. */
    videoKey: string | null;
    durationMs: null;
    metadata: { source: typeof LEGACY_PITCH_RECORDING_SOURCE };
    createdAt: Date;
  };
}

/** R2 key for a URL served from our CDN, else null (case-insensitive host,
 *  any number of slashes after it — same as the SQL regexp). */
export function cdnKeyFromUrl(url: string, cdnBase: string = DEFAULT_CDN_BASE): string | null {
  const host = cdnBase.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^https?://${escaped}/+(.*)$`, "i").exec(url);
  if (!match) return null;
  return match[1] ? match[1] : null;
}

/** Map one legacy user row to the project + recording to insert, or null
 *  when there is nothing to migrate (blank URL / already has a pitch). */
export function mapLegacyPitch(
  row: LegacyPitchUserRow,
  now: Date,
  cdnBase: string = DEFAULT_CDN_BASE,
): BackfilledPitch | null {
  const url = row.videoPitchUrl?.trim() ?? "";
  if (!url || row.hasCurrentPitch) return null;
  const setAt = row.videoPitchSetAt ?? row.updatedAt ?? now;
  return {
    project: {
      userId: row.userId,
      resumeText: "",
      kind: "scene",
      mediaKind: "video",
      name: LEGACY_PITCH_PROJECT_NAME,
      purpose: PITCH_PURPOSE,
      revision: 1,
      status: "draft",
      isCurrentPitch: true,
      createdAt: setAt,
      updatedAt: setAt,
    },
    recording: {
      userId: row.userId,
      type: "webcam",
      videoUrl: url,
      videoKey: cdnKeyFromUrl(url, cdnBase),
      durationMs: null,
      metadata: { source: LEGACY_PITCH_RECORDING_SOURCE },
      createdAt: setAt,
    },
  };
}
