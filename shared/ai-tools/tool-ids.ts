/**
 * AI tool dispatcher contract — the ids served by
 * `POST /api/ai/tools/:toolId` (+ `GET /api/ai/tools` catalog).
 *
 * One endpoint replaces the per-tool route files (resume scorer/optimizer,
 * skill extractor, value proposition, profile audit, salary, sentiment,
 * career resilience, improve-text, résumé summarize/revise/consolidate).
 * The server registry (api/src/services/ai-tools) is keyed by these ids and
 * every client builds its URL through `aiToolPath` — never a literal path.
 */

export const AI_TOOL_IDS = [
  "resume-score",
  "resume-optimize",
  "resume-consolidate-highlights",
  "resume-shorten-bullet",
  "resume-rewrite-bullet",
  "resume-rewrite-xyz-highlights",
  "resume-rewrite-xyz-text",
  "resume-rewrite-skills",
  "resume-consolidate-bullets",
  "resume-summarize",
  "resume-revise",
  "skill-extract",
  "template-extract",
  "value-proposition",
  "profile-audit",
  "sentiment",
  "salary-analyze",
  "salary-negotiation-tips",
  "career-resilience",
  "improve-text",
] as const;

export type AiToolId = (typeof AI_TOOL_IDS)[number];

/** Tools a signed-out visitor may run (the route is optional-auth for these
 *  ids only — the kit workspace chat edits an unsaved draft). The API's
 *  auth-mode table reads this list, so it stays dependency-free. */
export const ANONYMOUS_AI_TOOL_IDS: readonly AiToolId[] = ["resume-revise"];

/** Tools that answer `Accept: text/event-stream` with a streamed reply. */
export const STREAMING_AI_TOOL_IDS: readonly AiToolId[] = ["resume-score", "resume-optimize", "value-proposition"];

export const AI_TOOLS_BASE_PATH = "/api/ai/tools";

/** The dispatcher URL for one tool. */
export function aiToolPath(id: AiToolId): string {
  return `${AI_TOOLS_BASE_PATH}/${id}`;
}

export function isAiToolId(value: string): value is AiToolId {
  return (AI_TOOL_IDS as readonly string[]).includes(value);
}

/** One row of `GET /api/ai/tools`. */
export interface AiToolCatalogEntry {
  id: AiToolId;
  requirePro: boolean;
  anonymous: boolean;
  streaming: boolean;
}
