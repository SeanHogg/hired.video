/**
 * useBuildChat — the kit conversation after a résumé exists.
 *
 * A message is a change request ("make it punchier", "fit it on one page"):
 * it goes to POST /api/resumes/revise with the draft on screen, and the
 * revised content replaces the draft IN PLACE (via `onRevised`), and the turn
 * names what changed. A question ("how did you decide I have a career
 * break?") comes back as an answer and leaves the draft alone. The visitor
 * stays in the workspace — the old behaviour handed every message off to the
 * studio editor, which read as being thrown onto another screen.
 *
 * Owns only the turn log + in-flight state; the draft itself stays owned by
 * useResumeIntake, and saving the revision is useBuildHandoff's job. The log
 * comes back after a reload (useDraftScopedState).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import type { ReviseFocus } from "@shared/video-plan";
import { resumeService } from "@/lib/services/resume-service";
import { apiErrorCode } from "@/lib/errors";
import { useDraftScopedState } from "./use-draft-scoped-state";

/** `at`: when the turn was added (ms), so the chat can interleave it with
 *  the AI Tool runs (use-tool-runs.ts) in the order they happened. */
export type BuildChatTurn =
  | { id: number; at: number; from: "user"; text: string }
  /** `code`: the API's error code, for diagnostics ("REVISE_FAILED"). */
  | { id: number; at: number; from: "assistant"; outcome: "failed"; code?: string }
  /** `changed`: the areas the revision touched (server `ChangedArea`s). */
  | { id: number; at: number; from: "assistant"; outcome: "revised"; changed: string[] }
  | { id: number; at: number; from: "assistant"; outcome: "answered"; text: string };

const KEPT_TURNS = 100;
const NO_TURNS: BuildChatTurn[] = [];

function reviveTurns(stored: unknown): BuildChatTurn[] | null {
  if (!Array.isArray(stored)) return null;
  return stored.filter(
    (turn): turn is BuildChatTurn =>
      typeof turn === "object" &&
      turn !== null &&
      typeof turn.id === "number" &&
      typeof turn.at === "number" &&
      (turn.from === "user" ? typeof turn.text === "string" : turn.from === "assistant"),
  );
}
const persistTurns = (turns: BuildChatTurn[]): BuildChatTurn[] => turns.slice(-KEPT_TURNS);

interface Args {
  content: ResumeContent | null;
  /** A new draft (new parse, Start over) clears the log. */
  draftKey: unknown;
  /** The saved résumé the log is remembered under. */
  resumeId: string | null;
  /** What the visitor is looking at (the page, or one video scene), so
   *  "make this shorter" targets it. */
  focus: ReviseFocus;
  onRevised: (content: ResumeContent) => void;
}

export function useBuildChat({ content, draftKey, resumeId, focus, onRevised }: Args) {
  // draftRef: ignore a reply that lands after the draft it was for was replaced.
  const {
    value: turns,
    set: setTurns,
    draftRef,
  } = useDraftScopedState({ draftKey, resumeId, slice: "chat", empty: NO_TURNS, revive: reviveTurns, persist: persistTurns });
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  useEffect(() => setBusy(false), [draftKey]);
  // Restored turns keep their ids: new ones follow.
  useEffect(() => {
    for (const turn of turns) nextId.current = Math.max(nextId.current, turn.id + 1);
  }, [turns]);

  const send = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (!instruction || !content || busy) return;
      const forDraft = draftRef.current;
      setTurns((t) => [...t, { id: nextId.current++, at: Date.now(), from: "user", text: instruction }]);
      setBusy(true);
      try {
        const result = await resumeService.reviseResumeContent(content, instruction, focus);
        if (draftRef.current !== forDraft) return;
        if ("reply" in result) {
          const text = result.reply;
          setTurns((t) => [...t, { id: nextId.current++, at: Date.now(), from: "assistant", outcome: "answered", text }]);
          return;
        }
        const { changed } = result;
        // Nothing changed → no undo step for an identical draft.
        if (changed.length > 0) onRevised(result.content);
        setTurns((t) => [...t, { id: nextId.current++, at: Date.now(), from: "assistant", outcome: "revised", changed }]);
      } catch (err) {
        if (draftRef.current !== forDraft) return;
        const code = apiErrorCode(err) || undefined;
        setTurns((t) => [...t, { id: nextId.current++, at: Date.now(), from: "assistant", outcome: "failed", code }]);
      } finally {
        if (draftRef.current === forDraft) setBusy(false);
      }
    },
    [content, busy, focus, onRevised, draftRef, setTurns],
  );

  return { turns, busy, send };
}
