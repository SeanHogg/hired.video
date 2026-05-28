/**
 * Canonical AIContextType union — the single source of truth for "what
 * kind of page is the user looking at" across the AI brain.
 *
 * Previously this union was duplicated in
 * [frontend/lib/types/ai-context.ts](../frontend/lib/types/ai-context.ts)
 * and [shared/ai-tools/types.ts](./ai-tools/types.ts) (gap #1626). Both
 * now re-import from here.
 *
 * The frontend `AIContext` discriminated union maps each value to a
 * concrete context interface; values without a bespoke interface
 * (`studio`, `article-view`, …) are carried by `GeneralContext`. They
 * still differentiate the system prompt + quick-action suggestions +
 * (under #1620) MCP resource hints, even though they share the general
 * payload shape today. Bespoke payloads for those surfaces are a later
 * enhancement, tracked per-surface as they gain authoring tooling.
 */

export type AIContextType =
  // Resume
  | "resume-list"
  | "resume-create"
  | "resume-edit"
  | "resume-view"
  // Job
  | "job-list"
  | "job-create"
  | "job-edit"
  | "job-view"
  // Profile
  | "profile-view"
  | "profile-edit"
  // Communication
  | "outreach"
  | "messaging"
  // Discovery
  | "search"
  // Workspace
  | "dashboard"
  | "tasks"
  // Studio + content surfaces (general-shaped today; see file header)
  | "studio"
  | "article-view"
  | "article-edit"
  | "company-view"
  | "company-edit"
  | "course-learn"
  | "course-author"
  | "learning"
  | "interview-practice"
  // Fallback for any page without a more specific context
  | "general";

/** Context types that are carried by `GeneralContext` rather than a
 *  bespoke interface. Kept here so the frontend `GeneralContext`
 *  definition and any MCP mapping stay in sync without re-listing. */
export const GENERAL_SHAPED_CONTEXT_TYPES = [
  "general",
  "studio",
  "article-view",
  "article-edit",
  "company-view",
  "company-edit",
  "course-learn",
  "course-author",
  "learning",
  "interview-practice",
] as const satisfies readonly AIContextType[];

export type GeneralShapedContextType =
  (typeof GENERAL_SHAPED_CONTEXT_TYPES)[number];
