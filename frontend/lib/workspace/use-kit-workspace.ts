/**
 * Everything a career kit composes, in one hook, so the workspace only
 * renders. A kit = a résumé, its cover letter and its video, made and
 * edited together; it is the studio project carrying the résumé's
 * `resume_video` link (useKitProject).
 *
 *   entry (useKitEntry) · intake (useResumeIntake) · ONE undo history
 *   (useKitHistory over useContentHistory + the free elements) · insights + design picks (useResumeInsights) ·
 *   saving + PDF (useBuildHandoff → useDraftAutosave) · re-import ·
 *   reviews on the page (useWorkspaceReview) · the video (useBuildVideo) and
 *   its editor (useVideoEditor) · the left panel (useKitPanel) · zoom ·
 *   Post (usePostVideo) · navigation (useKitNavigation) · the chat
 *   (useBuildChat) · Create → Promote (useBuildJourney) · the letter
 *   (useCoverLetterView) · the kit's project (useKitProject) · free elements
 *   on the résumé / letter pages (useKitDocumentLayers) · a résumé template
 *   to wear (`?design=`, useKitTemplate).
 *
 * `ready` is set once the résumé, its insights and its video all exist.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import type { ReviseFocus } from "@shared/video-plan";
import { totalDurationSeconds } from "@/lib/studio/editor-v2/canvas-state";
import { useAuth } from "@/lib/auth";
import { SENIORITY_LABEL_KEYS } from "@/lib/build/insight-labels";
import { useResumeIntake } from "@/lib/build/use-resume-intake";
import { useResumeInsights } from "@/lib/build/use-resume-insights";
import { useBuildHandoff } from "@/lib/build/use-build-handoff";
import { useBuildChat } from "@/lib/build/use-build-chat";
import { useBuildVideo } from "@/lib/build/use-build-video";
import { useContentHistory } from "@/lib/build/use-content-history";
import { usePostVideo } from "@/lib/build/use-post-video";
import { usePreviewZoom } from "@/lib/build/use-preview-zoom";
import { useResumeReimport } from "@/lib/build/use-resume-reimport";
import { useVideoEditor } from "@/lib/build/use-video-editor";
import { useWorkspaceReview } from "@/lib/build/review/use-workspace-review";
import { useCoverLetterView } from "@/lib/build/use-cover-letter-view";
import { useResumeDraftBridge } from "@/lib/build/use-resume-draft-bridge";
import { useBuildJourney } from "@/lib/build/use-build-journey";
import { useFindingActions } from "@/lib/build/use-finding-actions";
import { useBuildDiagnostics } from "@/lib/build/build-diagnostics";
import { resumeTitle, toPreviewResume } from "@/lib/build/preview-resume";
import { useResumeTitle } from "@/lib/build/use-resume-title";
import { useOpenedAt } from "@/lib/build/use-opened-at";
import { useKitEntry } from "./use-kit-entry";
import { useKitNavigation } from "./use-kit-navigation";
import { useKitPanel } from "./use-kit-panel";
import { useKitProject } from "./use-kit-project";
import { useKitDocumentLayers } from "./kit/use-kit-document-layers";
import { useKitHistory } from "./kit/use-kit-history";
import { useKitTemplate } from "./kit/use-kit-template";
import { useKitDraftFilter } from "./kit-draft";
import { useUndoShortcuts } from "./use-undo-shortcuts";

interface Args {
  /** The kit project in the URL (/studio/:id), or null for a new kit. */
  projectId: string | null;
  /** The résumé the route names (/studio/resume/:id, or the project's). */
  resumeId: string | null;
}

export function useKitWorkspace({ projectId, resumeId }: Args) {
  const { t } = useTranslation();
  // The browser's last draft only when it is this kit's (kit-draft.ts).
  const intake = useResumeIntake({ keep: useKitDraftFilter(resumeId) });
  // ONE Undo / Redo over the résumé and the pages' free elements, in time
  // order (useKitHistory); each store keeps its own snapshots.
  const kitHistory = useKitHistory();
  const { record: recordStep, forget: forgetSteps } = kitHistory;
  const history = useContentHistory({
    content: intake.content,
    draftKey: intake.source,
    apply: intake.applyRevision,
    onStep: () => recordStep("content"),
    onReset: () => forgetSteps("content"),
  });
  const picks = useResumeInsights(intake.content, intake.source, intake.source?.kind === "existing");
  const handoff = useBuildHandoff({
    content: intake.content,
    source: intake.source,
    descriptor: picks.descriptor,
    design: picks.design,
    autoPersist: !intake.restored,
    restoredResumeId: intake.restoredResumeId,
    // Another tab saved this résumé and the user took its copy: one Undo step.
    onLoadNewer: (newer) => history.commit(newer, "load-newer"),
  });
  // The draft's row, remembered with it in this browser (see kit-draft.ts).
  const { rememberSaved, source: intakeSource } = intake;
  const { savedResumeId } = handoff;
  // The render a new draft arrives in still carries the old draft's id
  // (autosave lets go of it in an effect): only a settled draft is paired.
  const pairedSource = useRef(intakeSource);
  useEffect(() => {
    const settled = pairedSource.current === intakeSource;
    pairedSource.current = intakeSource;
    if (settled && savedResumeId) rememberSaved(intakeSource, savedResumeId);
  }, [savedResumeId, intakeSource, rememberSaved]);
  // "Start over with it" re-imports a second résumé INTO the open one (undoable).
  const reimport = useResumeReimport({ content: intake.content, onParsed: history.commit });
  const { review, intake: reviewIntake, openHandoff } = useWorkspaceReview({
    draft: intake.content,
    draftKey: intake.source,
    ready: intake.status === "ready",
    resumeId: handoff.savedResumeId,
    ensureSaved: handoff.ensureSavedResume,
    commit: history.commit,
    openResume: intake.adoptContent,
    requireAccount: handoff.requireAccount,
    replaceWith: (file) => void reimport.reimport(file),
  });
  const video = useBuildVideo({ content: intake.content, commit: history.commit, t });
  const editor = useVideoEditor({ video, content: intake.content, commit: history.commit, t });
  const panel = useKitPanel();
  const zoom = usePreviewZoom();
  const post = usePostVideo(intake.source);
  // Read by navigation when a stage picks its page (the letter comes later).
  const hasLetterRef = useRef(false);
  const nav = useKitNavigation({
    draftKey: intake.source,
    resumeId: handoff.savedResumeId,
    hasLetter: () => hasLetterRef.current,
    showChat: () => panel.show("chat"),
    editSection: panel.editSection,
    resetPanel: panel.reset,
    showPost: post.show,
    closePost: post.close,
    selectScene: video.select,
    resetIntake: intake.reset,
  });
  // Change requests revise the draft in place (one undo step each), aimed at
  // what is on screen; a new parse / Start over clears the log.
  const focus = useMemo<ReviseFocus>(
    () => (nav.page === "video" ? { view: "video", scene: video.selected } : { view: "page" }),
    [nav.page, video.selected],
  );
  const chat = useBuildChat({
    content: intake.content,
    draftKey: intake.source,
    resumeId: handoff.savedResumeId,
    focus,
    onRevised: review.onRevised,
  });
  // Every request for the AI — typed, a stage's "do it for me", or from a
  // tool — goes to the kit's chat, with the chat in view.
  const { show: showPanel } = panel;
  const { send } = chat;
  const askChat = useCallback(
    (text: string): Promise<void> => {
      showPanel("chat");
      return send(text);
    },
    [showPanel, send],
  );
  const { editing } = panel;
  // One undo step per burst of typing in a section (see useContentHistory).
  const { commit } = history;
  const commitEdit = useCallback(
    (next: ResumeContent) => commit(next, `edit:${editing ?? ""}`),
    [commit, editing],
  );
  // `?design=`: the résumé wears a résumé template (preset or studio).
  const wearTemplate = useKitTemplate({
    content: intake.content,
    commit,
    setTemplateId: picks.setTemplateId,
    keepSavedDesign: picks.keepSavedDesign,
  });
  const entry = useKitEntry({
    resumeId,
    parseFile: intake.parseFile,
    parseText: intake.parseText,
    adoptContent: intake.adoptContent,
    onSection: panel.editSection,
    onDesign: () => panel.show("design"),
    onPage: nav.setPage,
    onTool: panel.show,
    onTemplate: wearTemplate,
    onReview: openHandoff,
    content: intake.status === "ready" ? intake.content : null,
    commit,
  });

  const fallbackTitle = t("build.untitledResume");
  // An opened résumé keeps its own name; a new draft is named after the person.
  const title = useResumeTitle({
    resumeId: handoff.savedResumeId,
    initial: intake.source?.kind === "existing" ? intake.source.title : resumeTitle(intake.content, fallbackTitle),
  });
  const previewResume = useMemo(
    () => (intake.content ? toPreviewResume(intake.content, title.title) : null),
    [intake.content, title.title],
  );

  useResumeDraftBridge({ resumeId: handoff.savedResumeId, content: intake.content, commit });
  // While the route's résumé loads, a draft restored from this browser is
  // not shown in its place.
  const ready =
    entry.status !== "loading" &&
    intake.status === "ready" &&
    intake.content &&
    picks.insights &&
    previewResume &&
    video.outline &&
    editor.canvas
      ? {
          content: intake.content,
          insights: picks.insights,
          resume: previewResume,
          outline: video.outline,
          canvas: editor.canvas,
        }
      : null;

  const project = useKitProject({
    routeProjectId: projectId,
    resumeId: handoff.savedResumeId,
    title: handoff.videoTitle,
    // What the kit SHOWS — not a draft shown while the route's résumé loads.
    canvas: ready?.canvas ?? null,
    draft: ready?.content ?? null,
    draftKey: ready ? intake.source : null,
  });
  const journey = useBuildJourney({
    stage: nav.stage,
    draftKey: intake.source,
    resumeId: handoff.savedResumeId,
    ensureSaved: handoff.ensureSavedResume,
    requireAccount: handoff.requireAccount,
    revise: askChat,
    seniorityKey: picks.insights ? SENIORITY_LABEL_KEYS[picks.insights.seniority] : null,
    seconds: editor.canvas ? totalDurationSeconds(editor.canvas) : 0,
    scenes: video.outline?.scenes.length ?? 0,
    content: intake.content,
    review: review.active,
    // AI Tool runs are kept on the kit's project: /studio/<id> brings them back.
    projectId: project.projectId,
    ensureProjectId: project.ensureProjectId,
  });
  // Dismiss / apply for the scoring findings — ONE owner, read by the page's
  // flags and the "This line" inspector.
  const findingActions = useFindingActions({
    findings: journey.findings,
    resumeId: handoff.savedResumeId,
    runTool: journey.runTool,
  });
  // When the open review started, so the chat shows it in order.
  const reviewAt = useOpenedAt(review.active ? `${review.active.kind}:${review.active.subject}` : null);
  const diagnostics = useBuildDiagnostics({
    intake,
    handoff,
    stage: nav.stage,
    tab: nav.page,
    post,
    chat,
    history,
    review,
    video,
    picks,
  });

  // The letter: the job review's, or the one saved on the résumé.
  const letter = useCoverLetterView(review, intake.content, commit);
  hasLetterRef.current = letter !== null;
  // The letter went away (review discarded, another résumé opened): the résumé.
  const { page, setPage } = nav;
  const hasLetter = letter !== null;
  useEffect(() => {
    if (page === "letter" && !hasLetter) setPage("resume");
  }, [page, hasLetter, setPage]);

  // Free elements on the résumé / letter pages, kept on the same project;
  // media dropped on a résumé entry binds to it (#2153).
  const { user } = useAuth();
  const docLayers = useKitDocumentLayers({
    projectId: project.projectId,
    resumeId: handoff.savedResumeId,
    title: handoff.videoTitle,
    onStep: () => recordStep("layers"),
    onReset: () => forgetSteps("layers"),
    resume: { content: intake.content, commit, userId: user?.id ?? null, batch: kitHistory.batch },
  });
  const { register: registerStore } = kitHistory;
  registerStore("content", history);
  registerStore("layers", docLayers);
  // The header's Undo / Redo and ⌘Z: the composite; `commit` stays the
  // résumé's (every content edit goes through it).
  const workspaceHistory = useMemo(
    () => ({ ...history, undo: kitHistory.undo, redo: kitHistory.redo, canUndo: kitHistory.canUndo, canRedo: kitHistory.canRedo }),
    [history, kitHistory],
  );
  useUndoShortcuts(workspaceHistory);

  return {
    intake,
    history: workspaceHistory,
    picks,
    handoff,
    reimport,
    review,
    reviewIntake,
    openHandoff,
    video,
    editor,
    panel,
    zoom,
    post,
    nav,
    chat,
    askChat,
    entry,
    journey,
    /** The findings on the page (dismissed ones left out). */
    findings: findingActions.visible,
    findingActions,
    diagnostics,
    commitEdit,
    letter,
    title,
    reviewAt,
    ready,
    projectId: project.projectId,
    /** The kit's ONE project, found or made once (see useKitProject). */
    ensureProjectId: project.ensureProjectId,
    /** Free elements on the résumé / letter pages (kit-document.ts). */
    docLayers,
  };
}

export type KitWorkspace = ReturnType<typeof useKitWorkspace>;
