/**
 * Which draft a career kit may pick up from this browser. useResumeIntake
 * keeps only the LAST draft, so it may belong to another résumé:
 *
 *   • a résumé's own address (/studio/resume/:id, a kit project) never
 *     does: the row is loaded, and a stored copy would only race it (and
 *     could be written over a newer row);
 *   • a new kit asked for from a link or menu (a PUSH to /studio/new)
 *     starts blank;
 *   • /studio/new otherwise (a reload, Back)
 *     keeps only a draft that never got a row — one that did is opened at
 *     its own address;
 *   • anywhere else with no résumé (a kit handed over to /studio/<id>)
 *     keeps it, except a saved draft on a link (a PUSH) — that would reopen
 *     the last kit. Sign-up returns a saved draft to its own address.
 */
import { useLocation, useNavigationType } from "react-router-dom";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import type { StoredDraft } from "@/lib/build/use-resume-intake";

interface Arrival {
  /** The résumé the route names, if any. */
  resumeId: string | null;
  pathname: string;
  /** Arrived by a link or menu (not a reload, Back or a redirect). */
  pushed: boolean;
}

export function keepsStoredDraft(draft: StoredDraft, { resumeId, pathname, pushed }: Arrival): boolean {
  if (resumeId) return false;
  const saved = draft.savedResumeId !== null;
  if (pathname === NEW_KIT_PATH) return !pushed && !saved;
  return !(pushed && saved);
}

/** The kit's `keep` for useResumeIntake (read once, on mount). */
export function useKitDraftFilter(resumeId: string | null): (draft: StoredDraft) => boolean {
  const { pathname } = useLocation();
  const pushed = useNavigationType() === "PUSH";
  return (draft) => keepsStoredDraft(draft, { resumeId, pathname, pushed });
}
