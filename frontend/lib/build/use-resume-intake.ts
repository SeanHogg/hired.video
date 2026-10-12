/**
 * useResumeIntake — the kit intake state machine.
 *
 *   idle → parsing → ready | error
 *
 * Every input that needs parsing (file, pasted text, a one-line
 * self-description) goes through ONE transport:
 * `resumeService.parseResumeFromFile` → POST /api/resumes/parse
 * (anonymous-capable, IP-capped server-side). Text is wrapped in a .txt File
 * so it reuses the service's transport choice + JSON-Resume mapping instead of
 * a second parse path.
 *
 * While parsing, `progress` carries the streamed stage / page / preview
 * (transient — never persisted, cleared by the next run).
 *
 * The parsed content is mirrored to localStorage so a visitor who signs up
 * mid-flow (email verify → redirect back to the kit workspace) lands on their resume
 * instead of an empty intake. Nothing is persisted server-side here: the
 * host says which row the draft was saved to (`rememberSaved`), and which
 * stored draft it may pick up (`keep` — the browser keeps only the last one,
 * so it may belong to another résumé).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import { resumeService } from "@/lib/services/resume-service";
import { PARSE_COMPLETE_HOLD_MS, type ResumeParseProgress } from "@/lib/services/resume-parse-stream";

export type IntakeStatus = "idle" | "parsing" | "ready" | "error";

/** What the visitor handed us — echoed back in the conversation. */
export type IntakeSource =
  | { kind: "file"; name: string }
  | { kind: "text"; text: string }
  /** A résumé the signed-in user already owns — adopted, never re-parsed.
   *  `resumeId` lets the draft autosave update THAT résumé instead of saving a copy. */
  | { kind: "existing"; title: string; resumeId: string };

export interface IntakeState {
  status: IntakeStatus;
  content: ResumeContent | null;
  source: IntakeSource | null;
  /** True when the content came back from localStorage, not a parse made
   *  in this visit. */
  restored: boolean;
}

export const BUILD_DRAFT_STORAGE_KEY = "hv:build:draft:v1";

/** The draft this browser kept: what it is, and the row it was saved to. */
export interface StoredDraft {
  source: IntakeSource | null;
  /** The résumé row the draft was saved to (an adopted résumé's is its own). */
  savedResumeId: string | null;
}

const IDLE: IntakeState = { status: "idle", content: null, source: null, restored: false };

function readDraft(keep: (draft: StoredDraft) => boolean): { state: IntakeState; savedResumeId: string | null } {
  const none = { state: IDLE, savedResumeId: null };
  try {
    const raw = localStorage.getItem(BUILD_DRAFT_STORAGE_KEY);
    if (!raw) return none;
    const parsed = JSON.parse(raw) as { content?: ResumeContent; source?: IntakeSource; savedResumeId?: string };
    if (!parsed?.content || typeof parsed.content !== "object") return none;
    const source = parsed.source ?? null;
    const savedResumeId =
      source?.kind === "existing" ? source.resumeId : typeof parsed.savedResumeId === "string" ? parsed.savedResumeId : null;
    if (!keep({ source, savedResumeId })) return none;
    return { state: { status: "ready", content: parsed.content, source, restored: true }, savedResumeId };
  } catch {
    return none;
  }
}

function writeDraft(state: IntakeState, savedResumeId: string | null): void {
  try {
    if (state.status === "ready" && state.content) {
      localStorage.setItem(
        BUILD_DRAFT_STORAGE_KEY,
        JSON.stringify({ content: state.content, source: state.source, savedResumeId }),
      );
    } else if (state.status === "idle") {
      localStorage.removeItem(BUILD_DRAFT_STORAGE_KEY);
    }
  } catch {
    // Private mode / quota — the draft simply isn't remembered.
  }
}

/** Wrap free text as a plain-text File so it rides the same parse transport. */
export function textToResumeFile(text: string): File {
  return new File([text], "resume.txt", { type: "text/plain" });
}

const KEEP_ANY = () => true;

interface Options {
  /** Whether the stored draft may be picked up here (read once). */
  keep?: (draft: StoredDraft) => boolean;
}

export function useResumeIntake({ keep = KEEP_ANY }: Options = {}) {
  const [initial] = useState(() => readDraft(keep));
  const [state, setState] = useState<IntakeState>(initial.state);
  const [progress, setProgress] = useState<ResumeParseProgress | null>(null);
  // Ignore results from a superseded request (Start over / a second upload).
  const requestRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The row THIS draft was saved to; a new draft has none until told.
  const savedIdRef = useRef(initial.savedResumeId);

  useEffect(() => {
    writeDraft(state, savedIdRef.current);
  }, [state]);

  /** The draft from `source` now has a résumé row: remembered with it, so
   *  this browser never picks it up as a new, unsaved draft. */
  const rememberSaved = useCallback((source: IntakeSource | null, resumeId: string) => {
    const current = stateRef.current;
    if (current.source !== source || savedIdRef.current === resumeId) return;
    savedIdRef.current = resumeId;
    writeDraft(current, resumeId);
  }, []);

  const run = useCallback(async (file: File, source: IntakeSource) => {
    const id = ++requestRef.current;
    savedIdRef.current = null;
    setState({ status: "parsing", content: null, source, restored: false });
    setProgress(null);
    try {
      const { data } = await resumeService.parseResumeFromFile(file, (next) => {
        if (id === requestRef.current) setProgress(next);
      });
      if (id !== requestRef.current) return;
      // Let the checklist finish every step before the résumé replaces it.
      setProgress((prev) => ({ stage: "refine", preview: null, ...prev, complete: true }));
      await new Promise((resolve) => window.setTimeout(resolve, PARSE_COMPLETE_HOLD_MS));
      if (id !== requestRef.current) return;
      setState({ status: "ready", content: data, source, restored: false });
    } catch {
      if (id !== requestRef.current) return;
      setState({
        status: "error",
        content: null,
        source,
        restored: false,
      });
    }
  }, []);

  const parseFile = useCallback(
    (file: File) => run(file, { kind: "file", name: file.name }),
    [run],
  );

  const parseText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return Promise.resolve();
      return run(textToResumeFile(trimmed), { kind: "text", text: trimmed });
    },
    [run],
  );

  /**
   * Adopt content that is ALREADY structured (a résumé on the account). No
   * transport, no AI: the parse pipeline exists to produce this shape, so
   * running it again would only cost tokens and risk drift.
   */
  const adoptContent = useCallback((content: ResumeContent, title: string, resumeId: string) => {
    requestRef.current++;
    savedIdRef.current = resumeId;
    setState({
      status: "ready",
      content,
      source: { kind: "existing", title, resumeId },
      restored: false,
    });
  }, []);

  /**
   * Replace the content of the CURRENT draft (a chat revision). The `source`
   * object is kept by reference on purpose: consumers treat a new source as a
   * new résumé and the same source as an edit of this one (useBuildHandoff
   * updates the saved row instead of minting another).
   */
  const applyRevision = useCallback((content: ResumeContent) => {
    setState((s) => (s.status === "ready" ? { ...s, content } : s));
  }, []);

  const reset = useCallback(() => {
    requestRef.current++;
    savedIdRef.current = null;
    setState(IDLE);
  }, []);

  return { ...state, progress, parseFile, parseText, adoptContent, applyRevision, reset, rememberSaved, restoredResumeId: initial.savedResumeId };
}
