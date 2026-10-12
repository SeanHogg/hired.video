/**
 * KitHeader — the workspace header for a career kit: the résumé's name
 * (renamed in place), the draft's save status, the kit's ONE Undo / Redo,
 * Preview, Simple | Advanced, and ⋯:
 *
 *   Details           the kit project's drawer (SEO, slug, social card…)
 *   Download PDF      the résumé, as it renders
 *   Save as…          course lesson (+ the project's template / clone /
 *                     delete rows below)
 *   Versions          the résumé's version history
 *   Advanced: Embed (SuperAdmin), Editing / Reviewing (feedback sessions),
 *             Invite (reviewers)
 *
 * A kit posts from its stepper's last step — never from the header.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { canvasStateToScript } from "@/lib/studio/editor-v2/canvas-to-script";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { WorkspaceDepthControls } from "@/lib/workspace/use-workspace-depth";
import { useResumeVersionAdapter } from "@/lib/workspace/use-resume-version-adapter";
import { useStudioProjectRow } from "@/lib/workspace/use-studio-project-row";
import { useProjectChrome } from "@/components/studio/shared/ProjectChromeMenu";
import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import EntityVersionHistoryDialog from "@/components/EntityVersionHistoryDialog";
import AttachToCourseDialog from "@/components/creator/AttachToCourseDialog";
import FeedbackSessionsDialog from "@/components/studio/review/FeedbackSessionsDialog";
import InviteReviewersDialog from "@/components/studio/review/InviteReviewersDialog";
import ResumeTitleField from "@/components/build/ResumeTitleField";
import WorkspaceSaveStatus from "../WorkspaceSaveStatus";
import DiagnosticsCopyButton from "@/components/DiagnosticsCopyButton";
import WorkspaceHeader from "../WorkspaceHeader";
import KitEmbedDialog from "./KitEmbedDialog";
import { formatLetterDate, printCoverLetter } from "@/lib/cover-letter-export";
import { kitPagePaper } from "@/lib/workspace/kit/kit-document";
import { kitPrintOverlays, kitPrintWidgets } from "@/lib/workspace/kit/kit-print-overlays";

type Dialog = "details" | "versions" | "course" | "embed" | "reviewing" | "invite" | null;

interface KitHeaderProps {
  kit: KitWorkspace;
  depth: WorkspaceDepthControls;
  onPreview: (() => void) | null;
  /** The address the diagnostics report names. */
  page: string;
}

export default function KitHeader({ kit, depth, onPreview, page }: KitHeaderProps) {
  const { t, i18n } = useTranslation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { ready, handoff, history, title, editor } = kit;
  const resumeId = handoff.savedResumeId;
  const { project, setProject } = useStudioProjectRow(kit.projectId);
  const versions = useResumeVersionAdapter(resumeId, (content) => history.commit(content, "versions:restore"));
  const chrome = useProjectChrome({
    project,
    getVideoScript: () => (editor.canvas ? canvasStateToScript(editor.canvas) : null),
  });
  const close = () => setDialog(null);
  const letterView = kit.nav.page === "letter" ? kit.letter : null;
  const shownLetter = letterView?.letter ?? null;
  // Downloads carry the page's free elements (kit-print-overlays.ts): the
  // letter's as PNGs in its print frame; the résumé's through its print page,
  // which reads them from the kit's project (saved first).
  const { docLayers } = kit;
  const downloadPdf =
    letterView && shownLetter
      ? async () => {
          const paper = kitPagePaper(shownLetter.style?.paper);
          const overlays = await kitPrintOverlays(docLayers.state, "letter", paper, docLayers.pageCounts.letter, kit.projectId).catch(() => undefined);
          printCoverLetter(shownLetter, letterView.content, formatLetterDate(shownLetter.date, i18n.language), overlays);
        }
      : () =>
          handoff.downloadPdf(
            kit.projectId && kitPrintWidgets(docLayers.state, "resume").length > 0
              ? { printParams: { kit: kit.projectId }, beforePrint: docLayers.flush }
              : {},
          );
  const superAdmin = isSuperAdminFromToken();

  return (
    <WorkspaceHeader
      surface="kit"
      backHref="/studio"
      title={ready ? <ResumeTitleField controls={title} /> : <span className="truncate text-sm font-semibold">{t("workspace.kit.newTitle")}</span>}
      saveStatus={<WorkspaceSaveStatus status={handoff.saveState} />}
      presence={<DiagnosticsCopyButton page={page} collect={kit.diagnostics} />}
      history={ready ? history : null}
      preview={onPreview ? { label: t("actions.preview"), onClick: onPreview } : null}
      depth={depth}
      moreActions={{
        details: project ? { onSelect: () => setDialog("details") } : null,
        // On the letter page the PDF is the letter; elsewhere the résumé.
        download: ready ? { onSelect: downloadPdf, busy: handoff.busy } : null,
        saveAs: kit.projectId ? { onSelect: () => setDialog("course"), label: t("workspace.more.saveAsLesson") } : null,
        versions: versions ? { onSelect: () => setDialog("versions") } : null,
        embed: superAdmin && kit.projectId && editor.canvas ? { onSelect: () => setDialog("embed") } : null,
        reviewing: resumeId ? { onSelect: () => setDialog("reviewing") } : null,
        invite: resumeId ? { onSelect: () => setDialog("invite") } : null,
      }}
      moreChildren={chrome.items}
      moreDialogs={
        <>
          {chrome.dialogs}
          {project && (
            <ProjectDetailsSheet
              project={project}
              onChange={setProject}
              noTrigger
              open={dialog === "details"}
              onOpenChange={(open) => !open && close()}
            />
          )}
          {versions && (
            <EntityVersionHistoryDialog
              open={dialog === "versions"}
              onOpenChange={(open) => !open && close()}
              entityLabel={t("labels.resume")}
              canSnapshot
              adapter={versions}
            />
          )}
          <AttachToCourseDialog
            open={dialog === "course"}
            onOpenChange={(open) => !open && close()}
            studioProjectId={kit.projectId}
            defaultTitle={handoff.videoTitle}
          />
          {dialog === "embed" && kit.projectId && editor.canvas && (
            <KitEmbedDialog
              projectId={kit.projectId}
              ensureProjectId={kit.ensureProjectId}
              title={handoff.videoTitle}
              canvas={editor.canvas}
              rendered={!!project?.videoUrl}
              onClose={close}
            />
          )}
          {resumeId && (
            <>
              <FeedbackSessionsDialog resumeId={resumeId} open={dialog === "reviewing"} onOpenChange={(open) => !open && close()} />
              <InviteReviewersDialog resumeId={resumeId} open={dialog === "invite"} onOpenChange={(open) => !open && close()} />
            </>
          )}
        </>
      }
    />
  );
}
