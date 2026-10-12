/**
 * Publish the kit's draft on the résumé-draft bridge while it has a saved row,
 * so the AI Brain binds to it and every résumé tool reads and edits THIS
 * draft (lib/tools/resume-content.ts). Each AI edit is its own Undo step —
 * never coalesced with the user's typing or with the AI's previous edit.
 */
import { useEffect, useRef } from "react";
import type { ResumeContent } from "@shared/resume";
import {
  registerResumeDraft,
  unregisterResumeDraft,
  type ResumeDraftHandle,
} from "@/lib/tools/resume-draft-bridge";

interface Args {
  resumeId: string | null;
  content: ResumeContent | null;
  commit: (next: ResumeContent, group?: string) => void;
}

export function useResumeDraftBridge({ resumeId, content, commit }: Args): void {
  // The handle reads through refs: one registration per résumé, always the
  // latest draft and commit.
  const contentRef = useRef(content);
  contentRef.current = content;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const hasContent = content !== null;

  useEffect(() => {
    if (!resumeId || !hasContent) return;
    let step = 0;
    const handle: ResumeDraftHandle = {
      resumeId,
      getContent: () => {
        if (!contentRef.current) throw new Error("Resume content unavailable.");
        return contentRef.current;
      },
      commit: (next, label) => {
        step += 1;
        contentRef.current = next;
        commitRef.current(next, `${label}#${step}`);
      },
    };
    registerResumeDraft(handle);
    return () => unregisterResumeDraft(handle);
  }, [resumeId, hasContent]);
}
