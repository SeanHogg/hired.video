/**
 * Video pitch — wire shape shared by the API and the frontend (#1237 /
 * #2133).
 *
 * A pitch is an ordinary studio project with `purpose: "pitch"` (see
 * shared/studio-purposes.ts). Its media is the latest `studio_recordings`
 * take linked to that project (the same row `POST /api/studio/recording/
 * upload` writes), and `studio_projects.is_current_pitch` marks the one
 * project per user that recruiters and visitors see. At most one current
 * pitch per user — enforced by the partial unique index
 * `uq_studio_projects_current_pitch_per_user` plus the set-as-pitch service.
 *
 * `PitchSummary` is what every read surface (public profile, shared
 * candidate résumé, recruiter pipeline cards, partner payload) embeds. It
 * carries the project id so playback analytics key on the studio project
 * like every other studio video.
 */

import { z } from "zod";
import type { StudioPurpose } from "./studio-purposes.js";

export const PITCH_PURPOSE = "pitch" as const satisfies StudioPurpose;

export const PitchSummarySchema = z.object({
  projectId: z.string(),
  videoUrl: z.string(),
  durationMs: z.number().nullable(),
  /** ISO timestamp of the take being shown. */
  recordedAt: z.string().nullable(),
});

export type PitchSummary = z.infer<typeof PitchSummarySchema>;
