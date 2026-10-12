/**
 * Map production `toolId` strings (kebab-case as used by `<ToolPageHeader
 * toolId="…" />` across [frontend/pages/tools/](hired.video/frontend/pages/tools/))
 * to gamification action keys.
 *
 * Tools not in this map fall through to the generic `ai.tool.used`
 * action — every AI-tool run still earns points, just at the generic
 * rate. Tools listed here qualify for the richer per-tool actions
 * (`resume.tailored` and `cover_letter.generated`) which carry higher
 * point values + their own daily caps in
 * [rules.ts](hired.video/api/src/domains/gamification/rules.ts).
 *
 * Adding a new tool: grep [frontend/pages/tools/](hired.video/frontend/pages/tools/)
 * for `toolId="…"` to get the canonical id, then add the entry below.
 * The pin in [__tests__/tool-id-mapping.test.ts] should fail if a tool
 * is renamed and this map drifts — keeps this from rotting silently.
 */

import { ACTIONS } from "./rules.js";

/** Production tool ids that earn under richer actions. Everything else
 *  in tool-runs.ts falls through to ai.tool.used. */
export const TOOL_ID_TO_ACTION: Readonly<Record<string, string>> = {
  // Resume tailoring family
  "resume-tailor": ACTIONS.RESUME_TAILORED,
  "resume-optimizer": ACTIONS.RESUME_TAILORED,

  // Cover letter — written with every job review in the kit workspace
  // (useCoverLetterWriter records a "cover-letter" run per letter)
  "cover-letter": ACTIONS.COVER_LETTER_GENERATED,
  "cover-letter-generator": ACTIONS.COVER_LETTER_GENERATED,
};
