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

/** Max consecutive identical characters. Above this it's almost certainly a
 *  placeholder ("ssssssss…") not real description text. Identified by #484
 *  after a user typed 60+ repeated chars and burned 2.8 minutes of LLM
 *  time on an unusable scene title. */
export const MAX_REPEATED_CHAR_RUN = 4;

export function hasRepeatedCharPlaceholder(text: string): boolean {
  // Look for any character (excluding whitespace) repeated more than the cap.
  return new RegExp(`(\\S)\\1{${MAX_REPEATED_CHAR_RUN},}`).test(text);
}

export function canGenerateScript(state: StudioProjectState): boolean {
  const trimmed = state.resumeText.trim();
  if (trimmed.length < MIN_PROMPT_CHARS) return false;
  if (hasRepeatedCharPlaceholder(trimmed)) return false;
  return true;
}
