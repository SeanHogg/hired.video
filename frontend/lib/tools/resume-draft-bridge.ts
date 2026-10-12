/**
 * The résumé draft open in THIS tab (the kit workspace), for code outside its React tree
 * — the AI Brain's tool runners, which run in the global chat panel.
 *
 * The kit workspace edits a local draft (undo history + debounced autosave). A tool that
 * read the row from the server would see a stale copy, and one that wrote the
 * row would be silently overwritten by the next autosave and never show on the
 * page. So while the kit workspace is open it registers its draft here, and the tools'
 * one content port (resume-content.ts) reads and writes THROUGH it: the AI's
 * change lands on the page as one Undo step and autosave persists it.
 *
 * Same single-slot shape as studio-editor-bridge.ts — one editor per tab.
 */
import type { ResumeContent } from "@shared/resume";

export interface ResumeDraftHandle {
  /** The saved row this draft belongs to. */
  resumeId: string;
  /** The draft as it is on screen right now. */
  getContent(): ResumeContent;
  /** Replace the draft — one Undo step, labelled for the history. */
  commit(next: ResumeContent, label: string): void;
}

const registry: { current: ResumeDraftHandle | null } = { current: null };

export function registerResumeDraft(handle: ResumeDraftHandle): void {
  registry.current = handle;
}

/** Clears the slot only if it still holds `handle` (a late unmount must not
 *  drop a newer registration). */
export function unregisterResumeDraft(handle: ResumeDraftHandle): void {
  if (registry.current === handle) registry.current = null;
}

/** The open draft — or, given an id, the open draft only if it is that résumé. */
export function getResumeDraft(resumeId?: string): ResumeDraftHandle | null {
  const current = registry.current;
  if (!current) return null;
  return resumeId === undefined || current.resumeId === resumeId ? current : null;
}
