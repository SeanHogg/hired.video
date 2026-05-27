/**
 * AI Prompt Registry — shared types.
 *
 * Every system prompt in the platform lives in this directory and is
 * registered in `index.ts`. Routes, the in-app chat panel, and (once
 * #1620 lands) the MCP `prompts/list` endpoint all read from the same
 * registry so persona drift between surfaces is impossible.
 *
 * Variables: each prompt declares the variables it accepts plus a
 * `render(vars)` function that returns the final string. Variables are
 * typed via the prompt's own `Vars` interface — there is no generic
 * template substitution to avoid silent missing-key bugs.
 */

import type { UserRole } from "../user-roles.js";

/** Stable, kebab-case identifier — used as a registry key and (under
 *  #1620) as the MCP prompt URI (`prompt://<id>`). Never rename a
 *  shipped id — add a new one alongside and migrate callers. */
export type PromptId =
  | "career-coach"
  | "resume-editor-consolidate"
  | "resume-editor-shorten"
  | "resume-roast"
  | "interview-question-generator"
  | "interview-answer-coach";

export interface PromptDef<Vars = Record<string, never>> {
  /** Stable identifier — see PromptId. */
  id: PromptId;
  /** One-line description used by MCP `prompts/list` and the SuperAdmin
   *  prompt browser. */
  description: string;
  /** Render the final system-prompt string. Pure function — no I/O. */
  render: (vars: Vars) => string;
}

/** Variables accepted by the career-coach prompt. All fields optional —
 *  the prompt renders a useful default when nothing is known. */
export interface CareerCoachVars {
  name?: string;
  role?: UserRole | string;
  plan?: string;
}
