/**
 * Auto-caption persistence for /api/studio/captions. SQL lives in
 * repositories/studioCaptionsRepository.ts; cue building + SRT/WebVTT
 * rendering stay with the route's pure helpers.
 */
import { getDb } from "../../db/index.js";
import {
  findLatestCaption,
  insertCaption,
  type StudioCaptionInsert,
  type StudioCaptionRow,
} from "../../repositories/studioCaptionsRepository.js";

export function saveCaption(values: StudioCaptionInsert): Promise<StudioCaptionRow> {
  return insertCaption(getDb(), values);
}

/** The caller's newest caption set for a project, or null. */
export function getLatestCaption(userId: string, projectId: string): Promise<StudioCaptionRow | null> {
  return findLatestCaption(getDb(), projectId, userId);
}
