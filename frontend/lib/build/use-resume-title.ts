/**
 * The open résumé's name on the kit workspace — the saved row's `title` (an opened
 * résumé's own name; a new draft is named after the person until renamed) —
 * and renaming it in place. The name is the row's, not the content's: a
 * rename never touches Undo or the draft.
 */
import { useCallback, useState } from "react";
import { resumeService } from "@/lib/services/resume-service";

interface Args {
  /** The saved row; null until autosave made one (nothing to rename yet). */
  resumeId: string | null;
  /** The name before any rename in this visit. */
  initial: string;
}

export function useResumeTitle({ resumeId, initial }: Args) {
  const [renamed, setRenamed] = useState<{ id: string; title: string } | null>(null);
  const title = renamed && renamed.id === resumeId ? renamed.title : initial;

  /** Resolves false when there is nothing to rename or the name is blank. */
  const rename = useCallback(
    async (next: string): Promise<boolean> => {
      const name = next.trim();
      if (!resumeId || !name) return false;
      if (name === title) return true;
      await resumeService.updateResumeData(resumeId, { title: name });
      setRenamed({ id: resumeId, title: name });
      return true;
    },
    [resumeId, title],
  );

  return { title, canRename: resumeId !== null, rename };
}

export type ResumeTitleControls = ReturnType<typeof useResumeTitle>;
