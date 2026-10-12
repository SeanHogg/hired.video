/**
 * useSectionDrill — which section of a studio inspector (PropertiesPanel)
 * is open in place. The studio's sections are drills like a kit's rows
 * (inspector-drills), so the host keeps this state and puts ‹ back in the
 * slot header (slotHeader) — the body never draws a back row of its own.
 *
 * The open section belongs to the subject it was opened on (a scene, a
 * widget): selecting another CLOSES it (going back to the first subject
 * shows its rows, not the old section), and an Advanced-only section hides
 * while the workspace is on Simple. The title is kept as its translation KEY
 * — hosts translate at render, so the slot header follows a language change.
 */
import { useCallback, useState } from "react";
import { isPlainInspectorSection } from "@/lib/workspace/inspector-depth";

export interface SectionDrill {
  /** The open section's id, or null for the rows. */
  id: string | null;
  /** Its title's translation key (for the slot header), or null for the rows. */
  labelKey: string | null;
  open: (id: string, labelKey: string) => void;
  back: () => void;
}

export function useSectionDrill(subject: string, advanced: boolean): SectionDrill {
  const [state, setState] = useState<{ subject: string; id: string; labelKey: string } | null>(null);
  // Reset on a selection change (render-phase update, React's "adjust state
  // when a prop changes" pattern — no stale frame, no effect).
  const [seenSubject, setSeenSubject] = useState(subject);
  if (seenSubject !== subject) {
    setSeenSubject(subject);
    if (state !== null) setState(null);
  }
  const shown = state && state.subject === subject && (advanced || isPlainInspectorSection(state.id)) ? state : null;
  const open = useCallback((id: string, labelKey: string) => setState({ subject, id, labelKey }), [subject]);
  const back = useCallback(() => setState(null), []);
  return { id: shown?.id ?? null, labelKey: shown?.labelKey ?? null, open, back };
}
