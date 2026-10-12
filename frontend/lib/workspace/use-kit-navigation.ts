/**
 * Where a career kit is looking: the Create → Promote stage, the page it
 * shows (résumé | letter | video — the stage decides, kit-stages.ts), the
 * Post panel, the open section editor and the focused scene. Every "go
 * there" in the kit (the stepper and its Next, a section pencil, a scene's
 * source, a review's "see the letter", Start over) is one of these, so the
 * workspace wires navigation once. Stage + page are remembered per résumé,
 * so a reload opens where the visitor was.
 */
import { useCallback, useRef, type SetStateAction } from "react";
import type { VideoSceneId } from "@shared/video-plan";
import { BUILD_STAGES, type BuildStageId } from "@/lib/build/build-stages";
import { useDraftScopedState } from "@/lib/build/use-draft-scoped-state";
import { KIT_PAGES, kitNextAction, pageForStage, stageOpensPost, type KitPage } from "./kit-stages";

interface View {
  stage: BuildStageId;
  page: KitPage;
}

const START: View = { stage: "create", page: "resume" };

function reviveView(stored: unknown): View | null {
  if (typeof stored !== "object" || stored === null) return null;
  const { stage, page, tab } = stored as Record<string, unknown>;
  // `tab` = the name the kit workspace stored it under.
  const shown = page ?? tab;
  const okStage = (BUILD_STAGES as readonly unknown[]).includes(stage);
  const okPage = (KIT_PAGES as readonly unknown[]).includes(shown);
  return okStage && okPage ? { stage: stage as BuildStageId, page: shown as KitPage } : null;
}

interface Args {
  /** A new draft (new parse, another résumé, Start over) starts at Create. */
  draftKey: unknown;
  /** The saved résumé the stage + page are remembered under. */
  resumeId: string | null;
  /** Whether the kit has a cover letter (Target falls back to the résumé). */
  hasLetter: () => boolean;
  showChat: () => void;
  editSection: (key: string) => void;
  resetPanel: () => void;
  showPost: () => void;
  /** Leaving the last stage hands the slot back to the page's panel. */
  closePost: () => void;
  selectScene: (id: VideoSceneId) => void;
  resetIntake: () => void;
}

export function useKitNavigation({
  draftKey,
  resumeId,
  hasLetter,
  showChat,
  editSection,
  resetPanel,
  showPost,
  closePost,
  selectScene,
  resetIntake,
}: Args) {
  const { value: view, set: setView } = useDraftScopedState({ draftKey, resumeId, slice: "view", empty: START, revive: reviveView });
  const { page, stage } = view;
  const hasLetterRef = useRef(hasLetter);
  hasLetterRef.current = hasLetter;

  const setPage = useCallback(
    (next: SetStateAction<KitPage>) =>
      setView((v) => ({ ...v, page: typeof next === "function" ? next(v.page) : next })),
    [setView],
  );

  /** The stepper: go to a stage — its page, and Post at the last one. */
  const goToStage = useCallback(
    (next: BuildStageId) => {
      setView({ stage: next, page: pageForStage(next, { hasLetter: hasLetterRef.current() }) });
      if (stageOpensPost(next)) {
        showPost();
        return;
      }
      closePost();
      if (next !== "video") showChat();
    },
    [setView, showPost, closePost, showChat],
  );

  /** The stepper's ONE primary button. */
  const next = useCallback(() => {
    const action = kitNextAction(stage);
    if (action.kind === "post") showPost();
    else goToStage(action.stage);
  }, [stage, goToStage, showPost]);

  /** Post (the last step, or a "Post video" anywhere): video + Post panel. */
  const openPost = useCallback(() => {
    setView({ stage: "promote", page: "video" });
    showPost();
  }, [setView, showPost]);

  const openScene = useCallback(
    (id: VideoSceneId) => {
      selectScene(id);
      setPage("video");
    },
    [selectScene, setPage],
  );

  /** A pencil on the page (or a scene's source): that section's editor. */
  const editFromPage = useCallback(
    (key: string) => {
      setPage("resume");
      editSection(key);
    },
    [editSection, setPage],
  );

  const startOver = useCallback(() => {
    resetIntake();
    resetPanel();
    setView(START);
  }, [resetIntake, resetPanel, setView]);

  return { page, setPage, stage, goToStage, next, openPost, openScene, editFromPage, startOver };
}
