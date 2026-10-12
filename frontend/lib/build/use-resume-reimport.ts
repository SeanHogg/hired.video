/**
 * useResumeReimport — replace the open résumé's content with a newly
 * uploaded file, keeping it the SAME résumé (the paperclip in the kit workspace once a
 * résumé exists; the studio's "upload into this résumé" lived here before).
 *
 * The parse goes through the same transport as the intake
 * (resumeService.parseResumeFromFile); the result is handed to `onParsed`
 * (the undo history), so a re-import is one undoable step and is saved onto
 * the same row. The résumé's own `meta` (design), `metaData` (media
 * attachments) and `skillEvidence` are carried over — a file never contains
 * them.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { useToast } from "@/hooks/use-toast";
import { isAcceptedResumeFile } from "@/lib/build-entry";
import { resumeService } from "@/lib/services/resume-service";

export function mergeReimported(current: ResumeContent, parsed: ResumeContent): ResumeContent {
  return {
    ...parsed,
    ...(current.meta ? { meta: current.meta } : {}),
    ...(current.metaData ? { metaData: current.metaData } : {}),
    ...(current.skillEvidence ? { skillEvidence: current.skillEvidence } : {}),
  };
}

interface Args {
  content: ResumeContent | null;
  onParsed: (next: ResumeContent) => void;
}

export function useResumeReimport({ content, onParsed }: Args) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const reimport = useCallback(
    async (file: File) => {
      if (!content || busy) return;
      if (!isAcceptedResumeFile(file)) {
        toast({ title: t("build.reimport.unsupported"), variant: "destructive" });
        return;
      }
      setBusy(true);
      try {
        const { data } = await resumeService.parseResumeFromFile(file);
        onParsed(mergeReimported(content, data));
        toast({ title: t("build.reimport.done", { name: file.name }) });
      } catch {
        toast({ title: t("build.reimport.failed"), variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [content, busy, onParsed, toast, t],
  );

  return { reimport, busy };
}
