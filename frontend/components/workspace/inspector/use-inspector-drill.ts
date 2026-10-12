/**
 * useInspectorDrill — which row of an inspector is open in place. The open
 * drill belongs to the subject it was opened on (a scene, a résumé line,
 * the letter): selecting another subject closes it (coming back shows the
 * rows, not the old drill), and a row that stops showing (an advanced row
 * after switching to Simple) closes.
 */
import { useCallback, useState } from "react";
import { isDrillShown, type InspectorDrillRegistry } from "./inspector-drills";

export interface InspectorDrillState<Id extends string> {
  /** The open row, or null for the rows. */
  drill: Id | null;
  open: (id: Id) => void;
  back: () => void;
}

export function useInspectorDrill<Id extends string, Ctx extends object>(
  registry: InspectorDrillRegistry<Id, Ctx>,
  subject: string,
  advanced: boolean,
): InspectorDrillState<Id> {
  const [state, setState] = useState<{ subject: string; id: Id } | null>(null);
  // Selecting another subject closes the drill (coming back shows the rows).
  const [seenSubject, setSeenSubject] = useState(subject);
  if (seenSubject !== subject) {
    setSeenSubject(subject);
    if (state !== null) setState(null);
  }
  const drill = state && state.subject === subject && isDrillShown(registry, state.id, advanced) ? state.id : null;
  const open = useCallback((id: Id) => setState({ subject, id }), [subject]);
  const back = useCallback(() => setState(null), []);
  return { drill, open, back };
}
