/**
 * The AI tool registry — `POST /api/ai/tools/:toolId` dispatches here.
 * Keyed by the shared id list (shared/ai-tools/tool-ids.ts), so a tool the
 * clients can name is a tool the server serves (the Record type makes a
 * missing id a compile error).
 */
import type { AiToolId } from "../../../../shared/ai-tools/tool-ids.js";
import { ANONYMOUS_AI_TOOL_IDS, STREAMING_AI_TOOL_IDS, type AiToolCatalogEntry } from "../../../../shared/ai-tools/tool-ids.js";
import { careerResilienceTool, salaryAnalyzeTool, salaryNegotiationTipsTool, valuePropositionTool } from "./tools/career.js";
import { skillExtractTool, templateExtractTool } from "./tools/extractors.js";
import { improveTextTool, profileAuditTool } from "./tools/profile.js";
import { resumeOptimizeTool, resumeScoreTool } from "./tools/resume-analysis.js";
import {
  consolidateBulletsTool,
  consolidateHighlightsTool,
  rewriteBulletTool,
  rewriteSkillsTool,
  rewriteXyzHighlightsTool,
  rewriteXyzTextTool,
  shortenBulletTool,
} from "./tools/resume-rewrite.js";
import { resumeReviseTool, resumeSummarizeTool } from "./tools/resume-text.js";
import { sentimentTool } from "./tools/sentiment.js";
import type { AiToolEntry } from "./types.js";

export const AI_TOOL_REGISTRY: Record<AiToolId, AiToolEntry> = {
  "resume-score": resumeScoreTool,
  "resume-optimize": resumeOptimizeTool,
  "resume-consolidate-highlights": consolidateHighlightsTool,
  "resume-shorten-bullet": shortenBulletTool,
  "resume-rewrite-bullet": rewriteBulletTool,
  "resume-rewrite-xyz-highlights": rewriteXyzHighlightsTool,
  "resume-rewrite-xyz-text": rewriteXyzTextTool,
  "resume-rewrite-skills": rewriteSkillsTool,
  "resume-consolidate-bullets": consolidateBulletsTool,
  "resume-summarize": resumeSummarizeTool,
  "resume-revise": resumeReviseTool,
  "skill-extract": skillExtractTool,
  "template-extract": templateExtractTool,
  "value-proposition": valuePropositionTool,
  "profile-audit": profileAuditTool,
  sentiment: sentimentTool,
  "salary-analyze": salaryAnalyzeTool,
  "salary-negotiation-tips": salaryNegotiationTipsTool,
  "career-resilience": careerResilienceTool,
  "improve-text": improveTextTool,
};

/** `GET /api/ai/tools` — what each tool needs, no internals. */
export function aiToolCatalog(): AiToolCatalogEntry[] {
  return Object.values(AI_TOOL_REGISTRY).map((tool) => ({
    id: tool.id,
    requirePro: Boolean(tool.requirePro),
    anonymous: ANONYMOUS_AI_TOOL_IDS.includes(tool.id),
    streaming: STREAMING_AI_TOOL_IDS.includes(tool.id),
  }));
}
