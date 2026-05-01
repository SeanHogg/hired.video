/**
 * Single source of truth for "does this project have enough prompt content
 * to run the script generator?" Used by:
 *
 *   • StudioLayout's Save pipeline (validation gate)
 *   • StudioEditor's tab UI (Storyboard tab disabled state + intercept)
 *
 * Extracting the rule keeps the threshold + logic in one place so a future
 * change (e.g. lowering the minimum, accepting an uploaded resume id even
 * when text is short) lands everywhere at once.
 */

import type { StudioProjectState } from "@/types/studio";

/** Below this length the LLM doesn't have enough signal to produce a useful
 *  storyboard. Empirically tuned; raise/lower as needed. */
export const MIN_PROMPT_CHARS = 50;

export function canGenerateScript(state: StudioProjectState): boolean {
  return state.resumeText.trim().length >= MIN_PROMPT_CHARS;
}
