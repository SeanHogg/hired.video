/**
 * What the kit's Letter tab shows, and where an edit to it goes.
 *
 *   • A job review is open (tailor, create from a job): ITS letter — the one
 *     being written for the proposal — and edits stay in the review until
 *     "Save as version of master" stores them on the version.
 *   • Otherwise: the letter saved on the open résumé (`meta.coverLetter`);
 *     edits are draft commits (typing coalesced into one Undo step), saved
 *     by autosave like any other change. While another kind of review is
 *     open, its proposed page's letter shows read-only.
 *
 * Null when there is no letter and none is coming — the tab is not shown.
 */
import { useCallback, useMemo } from "react";
import type { ResumeContent } from "@shared/resume";
import { readCoverLetter, withCoverLetter, type CoverLetter } from "@shared/cover-letter";
import type { BuildReview } from "./review/use-build-review";
import type { CoverLetterStatus } from "./review/use-cover-letter-writer";

export interface CoverLetterView {
  letter: CoverLetter | null;
  /** The résumé the letter goes with (its header signs the letter). */
  content: ResumeContent;
  status: CoverLetterStatus;
  /** `group` names the Undo step: typing shares "edit:letter" (coalesced);
   *  a whole-letter action (a tone rewrite) passes its own so it is ONE step. */
  onChange: ((letter: CoverLetter, group?: string) => void) | undefined;
  rewrite: (() => void) | undefined;
}

export function useCoverLetterView(
  review: BuildReview,
  draft: ResumeContent | null,
  commit: (next: ResumeContent, group?: string) => void,
): CoverLetterView | null {
  const active = review.active;
  const pending = active?.letter;
  const saveOnDraft = useCallback(
    (letter: CoverLetter, group = "edit:letter") => {
      if (draft) commit(withCoverLetter(draft, letter), group);
    },
    [draft, commit],
  );

  return useMemo(() => {
    if (pending && pending.status !== "idle") {
      const content = active?.proposed ?? draft;
      if (!content) return null;
      return { letter: pending.letter, content, status: pending.status, onChange: pending.setLetter, rewrite: pending.rewrite };
    }
    // Any other review (a chat revision, a merge) shows the page it proposes;
    // its letter is read-only until that review is applied or discarded.
    const content = review.pageContent ?? draft;
    if (!content) return null;
    const letter = readCoverLetter(content);
    if (!letter) return null;
    return { letter, content, status: "ready", onChange: active ? undefined : saveOnDraft, rewrite: undefined };
  }, [pending, active, draft, review.pageContent, saveOnDraft]);
}
