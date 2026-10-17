/**
 * Studio features — helpers shared by every section module under
 * routes/studio-features/: the response envelopes, the studio_* tables, and
 * the one project-access rule for engagement reads and writes.
 */
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import { getDb, schema } from "../../db/index.js";
import { ownsByStudioProject } from "../../repositories/toolRunOwnershipRepository.js";

export const {
  studioVoiceClones, studioVoiceCloneLicenses, studioCaptions,
  youtubeAccounts, studioRecordings, studioDeliveryCoaching,
  studioAtsPackages, studioInterviewQuestions, studioInterviewSessions,
  studioSkillsDemos, studioAsyncInterviews, studioAsyncResponses,
  studioVideoHeatmap, stockMediaAssets, userStockMediaUsage,
  studioChapters,
  studioVideoForms, studioVideoFormSubmissions,
  studioThumbnails, marketingLeads,
} = schema;

export function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
export function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

/** The per-project engagement reads (review comments, chapters, candidate
 *  thumbnails) are private to whoever may act on the project: owner, company
 *  member or delegate (canActFor). Unknown, malformed and forbidden ids all
 *  answer 404, so a project's existence never leaks. */
export async function viewerCanActOnProject(actor: string | undefined, projectId: string): Promise<boolean> {
  if (!actor || !UUID_LIKE_REGEX.test(projectId)) return false;
  return ownsByStudioProject(getDb(), actor, projectId);
}
