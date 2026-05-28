/**
 * AI Tool Registry — single source of truth for every AI-callable
 * endpoint the platform ships.
 *
 * See [types.ts](./types.ts) for the shape and rationale. Adding a tool:
 *   (1) add one entry in a per-domain file under this directory,
 *   (2) export it from `TOOLS` below,
 *   (3) keep the id kebab-case + unique.
 *
 * Consumers should call `getTool(id)` / `getToolsForContext(type)` /
 * `getToolsByAction(action)` rather than touching the per-domain files
 * directly — the registry is the load-bearing surface and is what MCP
 * will iterate (gap #1620).
 */

import type { AIContextType, AIToolDef } from "./types.js";
import {
  resumeGet,
  resumeListMine,
  resumeOptimize,
  resumeRoast,
  resumeSave,
  resumeScore,
} from "./resume-tools.js";
import {
  jobGet,
  jobListPublic,
  jobResumeMatch,
  jobSave,
} from "./job-tools.js";
import { salaryAnalyze, salaryNegotiationTips } from "./salary-tools.js";
import { userProfileGet } from "./profile-tools.js";
import {
  taskDelete,
  taskGet,
  taskList,
  taskSave,
} from "./task-tools.js";
import {
  autoApply,
  careerResilience,
  discoveryJobs,
  interviewQuestions,
  profileAudit,
  skillExtract,
  videoPitchScript,
} from "./feature-tools.js";

export type { AIContextType, AIToolDef, HttpMethod } from "./types.js";
export { buildEndpointUrl } from "./types.js";

/** Every shipped AI tool, keyed by stable id. */
export const TOOLS: Record<string, AIToolDef> = {
  // Resume
  "resume-optimize": resumeOptimize,
  "resume-score": resumeScore,
  "resume-roast": resumeRoast,
  "resume-get": resumeGet,
  "resume-list-mine": resumeListMine,
  "resume-save": resumeSave,
  // Job
  "job-get": jobGet,
  "job-list-public": jobListPublic,
  "job-save": jobSave,
  "job-resume-match": jobResumeMatch,
  // Salary
  "salary-analyze": salaryAnalyze,
  "salary-negotiation-tips": salaryNegotiationTips,
  // Profile
  "user-profile-get": userProfileGet,
  // Task
  "task-get": taskGet,
  "task-list": taskList,
  "task-save": taskSave,
  "task-delete": taskDelete,
  // LLM-feature tools
  "interview-questions": interviewQuestions,
  "video-pitch-script": videoPitchScript,
  "skill-extract": skillExtract,
  "career-resilience": careerResilience,
  "profile-audit": profileAudit,
  "auto-apply": autoApply,
  "discovery-jobs": discoveryJobs,
};

/** All registered tool ids. */
export const TOOL_IDS = Object.keys(TOOLS);

/** Look up a tool by id. Throws on unknown id so a typo at a call site
 *  fails loudly rather than silently planning around a missing tool. */
export function getTool(id: string): AIToolDef {
  const tool = TOOLS[id];
  if (!tool) {
    throw new Error(`[ai-tools] Unknown tool id: ${id}`);
  }
  return tool;
}

/** All tools surfaced for a given page context type. */
export function getToolsForContext(contextType: AIContextType): AIToolDef[] {
  return Object.values(TOOLS).filter((tool) =>
    tool.contextTypes.includes(contextType),
  );
}

/** All tools that service a given coarse action label. */
export function getToolsByAction(action: string): AIToolDef[] {
  return Object.values(TOOLS).filter((tool) =>
    tool.supportedActions.includes(action),
  );
}
