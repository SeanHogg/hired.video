/**
 * Pure URL redirects — no project to mint: `?projectId=` reopens a project,
 * and old `?editResume=` links land in the résumé workspace (résumés are
 * edited in the kit workspace, not on a document canvas).
 */
import { LEGACY_RESUME_EDIT_PARAM } from "@/lib/studio/studio-authoring";
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import type { EntryHandler } from "./types";

export const projectIdEntry: EntryHandler = {
  id: "projectId",
  matches: (params) => !!params.get("projectId"),
  run: async ({ params }) => ({
    type: "navigate",
    to: `/studio/${encodeURIComponent(params.get("projectId") ?? "")}`,
  }),
};

export const legacyResumeEntry: EntryHandler = {
  id: "legacyResume",
  matches: (params) => !!params.get(LEGACY_RESUME_EDIT_PARAM),
  run: async ({ params }) => ({
    type: "navigate",
    to: resumeEditorPath(params.get(LEGACY_RESUME_EDIT_PARAM) ?? ""),
  }),
};
