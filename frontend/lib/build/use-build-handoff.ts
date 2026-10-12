/**
 * useBuildHandoff — what the kit workspace hands off to the rest of the product: the
 * PDF (REAL account required → persist the résumé → PDF print path), plus
 * the draft's save status and the video's title.
 *
 * It also lends the open review (useBuildReview) the same two things:
 * `ensureSavedResume` (a review needs a saved source) and `requireAccount`
 * (the same in-place sign-in sheet).
 *
 * Nothing else leaves the page: the kit workspace IS the résumé editor AND the video
 * editor (the studio's frame, timeline and palette run inside it — there is
 * no separate studio project to open), it posts from its own Post drawer
 * (ShareVideoDock), and useDraftAutosave (composed here) keeps the résumé
 * row in sync with it.
 *
 * Download asks for a real account in place (`useAuthGateState`; the host
 * renders `<AuthGateSheet {...gateSheet} />`); the download
 * then resumes from an effect keyed on `user` (NOT inline in the callback) so
 * it runs with the signed-in render's closure.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { useAuth } from "@/lib/auth";
import { useAuthGateState } from "@/lib/hooks/use-auth-gate-state";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/services/auth-service";
import { downloadResume } from "@/lib/resume-download";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import type { ResumeDesign } from "@/lib/resume-design";
import type { IntakeSource } from "./use-resume-intake";
import { resumeTitle } from "./preview-resume";
import { useDraftAutosave } from "./use-draft-autosave";

/** What a PDF download carries beyond the résumé (the kit's free elements:
 *  their project on the print URL, saved first). */
export interface PdfOptions {
  printParams?: Record<string, string>;
  beforePrint?: () => Promise<unknown>;
}

interface Args {
  content: ResumeContent | null;
  /** Identity of the draft (see useDraftAutosave). */
  source: IntakeSource | null;
  /** What the résumé renders with — the PDF prints exactly this. */
  descriptor: ResumeTemplateDescriptor;
  /** The design to save; null = keep the résumé's own (useDraftAutosave). */
  design: ResumeDesign | null;
  /** See useDraftAutosave. */
  autoPersist: boolean;
  /** See useDraftAutosave. */
  restoredResumeId?: string | null;
  /** See useDraftAutosave (the conflict prompt's "load the newer copy"). */
  onLoadNewer?: (content: ResumeContent) => void;
}

export function useBuildHandoff({ content, source, descriptor, design, autoPersist, restoredResumeId, onLoadNewer }: Args) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { saveState, ensureSavedResume, savedResumeId } = useDraftAutosave({
    content,
    source,
    design,
    autoPersist,
    restoredResumeId,
    onLoadNewer,
  });
  const { requireAuth, sheet: gateSheet } = useAuthGateState({
    // Back to THIS résumé after signing in, not a blank intake.
    redirectTo: savedResumeId ? resumeEditorPath(savedResumeId) : NEW_KIT_PATH,
    title: t("build.auth.title"),
  });

  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  const fallbackTitle = t("build.untitledResume");
  const videoTitle = (c: ResumeContent) =>
    t("build.video.projectName", { name: resumeTitle(c, fallbackTitle) });

  // What the last download asked to carry (kept for the resume after sign-in).
  const pdfOptions = useRef<PdfOptions>({});
  const download = async (): Promise<void> => {
    if (!content) return;
    setBusy(true);
    try {
      // The resume may have been saved by this visitor's guest session —
      // make sure it has been claimed onto the account before printing it.
      await authService.adoptGuest();
      const id = await ensureSavedResume();
      const { beforePrint, printParams } = pdfOptions.current;
      await beforePrint?.();
      await downloadResume({ id, format: "pdf", descriptor, printParams });
    } catch (err) {
      toast({
        title: t("build.errors.handoffFailed"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  // Always the latest closure (fresh `user`) for the resume effect.
  const downloadRef = useRef(download);
  downloadRef.current = download;

  useEffect(() => {
    if (!user || !pending) return;
    setPending(false);
    void downloadRef.current();
  }, [user, pending]);

  const downloadPdf = (options: PdfOptions = {}): void => {
    if (busy) return;
    pdfOptions.current = options;
    // requireAuth passes only for a REAL account (a guest gets the sheet).
    if (!requireAuth({ reason: t("build.auth.reasonDownload"), onAuthed: () => setPending(true) })) return;
    void download();
  };

  /** Reviews (merge, tailor, create-from-a-job) need a real account: false
   *  shows the sign-in sheet with the review's reason. */
  const requireAccount = useCallback((reasonKey: string) => requireAuth({ reason: t(reasonKey) }), [requireAuth, t]);

  return {
    gateSheet,
    busy,
    saveState,
    /** The draft's résumé row, once it has one. */
    savedResumeId,
    ensureSavedResume,
    requireAccount,
    /** The video's title — the same one the post dock posts under. */
    videoTitle: content ? videoTitle(content) : "",
    downloadPdf,
  };
}
