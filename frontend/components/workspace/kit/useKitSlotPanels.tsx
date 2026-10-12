/**
 * useKitSlotPanels — what a career kit puts in the ONE right slot:
 *
 *   inspector  every inspector is rows that open in place (‹ back) —
 *              components/workspace/inspector/. Résumé page: a line
 *              selected on the page (or its finding flag) → "This line"
 *              (useKitLineSlotPanel); otherwise what the stage needs beside
 *              the page (the Story at Create / Video, the job match at
 *              Target — build-stages resumeRailFor), else "This line"'s
 *              empty state; video page: the selected scene's rows
 *              (useSceneSlotPanel, build/video-design/scene/), and under
 *              Advanced, an element selected on the frame drills in to its
 *              properties (‹ back to the scene); letter page: the letter's
 *              rows (useKitLetterSlotPanel).
 *              Résumé / letter under Advanced: a free element selected on
 *              the page drills in to its properties (useKitElementSlotPanel).
 *   post       the Post panel (ShareVideoDock, saving into the kit's project)
 *   tool       an AI Tool's page (useToolSlotPanel)
 */
import { useCallback } from "react";
import KitWhatsNext from "./KitWhatsNext";
import { useTranslation } from "react-i18next";
import { resumeRailFor } from "@/lib/build/build-stages";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { SlotPanelId } from "@/lib/workspace/workspace-panels";
import KitStoryPanel from "./KitStoryPanel";
import { useSceneSlotPanel } from "@/components/build/video-design/scene/useSceneSlotPanel";
import FramePropertiesPanel from "@/components/build/FramePropertiesPanel";
import JobMatchPanel from "@/components/build/stage-panels/JobMatchPanel";
import ShareVideoDock from "@/components/studio/share/ShareVideoDock";
import type { SlotPanel } from "../RightSlot";
import { useToolSlotPanel } from "./useToolSlotPanel";
import { useKitElementSlotPanel } from "./useKitElementSlotPanel";
import { canvasSceneId } from "@/lib/build/scene-voiceover";
import { INSPECTOR_PAD as PAD } from "@/components/workspace/inspector/inspector-styles";
import { emptyLinePanel, useKitLineSlotPanel } from "./useKitLineSlotPanel";
import { useSectionDrill } from "@/components/workspace/inspector/use-section-drill";
import { slotHeader } from "@/components/workspace/inspector/InspectorBody";
import { useKitLetterSlotPanel } from "./useKitLetterSlotPanel";

export function useKitSlotPanels(kit: KitWorkspace, advanced: boolean): Record<SlotPanelId, SlotPanel | null> {
  const { t } = useTranslation();
  const { ready, nav, video, editor, journey, review, handoff, post } = kit;
  const tool = useToolSlotPanel({
    tool: journey.panel.open,
    projectId: kit.projectId,
    onClose: journey.panel.close,
    onAsk: (text) => void kit.askChat(text),
    onReview: kit.openHandoff,
    onResult: journey.record,
  });
  // Posting keeps the theme the video wears today, then saves the project.
  const { freezeTheme } = video;
  const { ensureProjectId } = kit;
  const ensurePostProject = useCallback(() => {
    freezeTheme();
    return ensureProjectId();
  }, [freezeTheme, ensureProjectId]);
  // The résumé line selected on the page: "This line" (rows → drills).
  const linePanel = useKitLineSlotPanel(kit, advanced);
  // The letter: its rows → drills.
  const letterPanel = useKitLetterSlotPanel(kit, advanced);
  // The selected scene: its rows, + the Advanced rows.
  const scenePanel = useSceneSlotPanel(kit, advanced);
  // A free element selected on the résumé / letter page (Advanced).
  const elementPanel = useKitElementSlotPanel(kit, advanced);
  // A section of the frame element's properties, open in place.
  const frameDrill = useSectionDrill(editor.frame.selected?.widget.id ?? "", true);
  if (!ready) return { inspector: null, post: null, tool };

  const sceneLabel = t(SCENE_LABEL_KEYS[video.selected]);
  const { frame, canvas } = editor;
  let inspector: SlotPanel | null = null;
  if (nav.page === "video") {
    inspector =
      advanced && frame.selected && canvas
        ? {
            ...(frameDrill.labelKey
              ? slotHeader({ kicker: sceneLabel, title: t("workspace.slot.element"), drillTitle: t(frameDrill.labelKey), onBack: frameDrill.back })
              : {
                  kicker: sceneLabel,
                  title: t("workspace.slot.element"),
                  onBack: () => frame.select({ kind: "scene", sceneId: canvasSceneId(video.selected) }),
                }),
            content: (
              <div className={PAD}>
                <FramePropertiesPanel
                  key={frame.selected.widget.id}
                  canvas={canvas}
                  frame={frame}
                  drill={frameDrill}
                />
              </div>
            ),
          }
        : scenePanel;
  } else if (elementPanel) {
    inspector = elementPanel;
  } else if (nav.page === "letter" && letterPanel) {
    inspector = letterPanel;
  } else if (nav.page === "resume") {
    const rail = resumeRailFor(nav.stage);
    if (linePanel) {
      // A line selected on the page (or its finding flag): "This line".
      inspector = linePanel;
    } else if (rail === "story") {
      inspector = {
        kicker: t("workspace.slot.thisResume"),
        title: t("workspace.slot.story"),
        content: (
          <div className={PAD}>
            <KitStoryPanel kit={kit} />
          </div>
        ),
      };
    } else if (rail === "jobMatch" && journey.jobMatch) {
      inspector = {
        kicker: t("workspace.slot.thisResume"),
        title: t("workspace.slot.jobMatch"),
        content: (
          <div className={PAD}>
            <JobMatchPanel
              match={journey.jobMatch}
              lineage={review.lineage}
              onAddKeyword={(keyword) => void kit.askChat(t("build.match.addLine", { keyword }))}
              className="sm:grid-cols-1"
            />
          </div>
        ),
      };
    } else {
      // Nothing beside the page: "This line" says how to pick one, so the
      // closed slot keeps its edge tab.
      inspector = emptyLinePanel(t);
    }
  }

  return {
    inspector,
    post: {
      kicker: t("workspace.slot.post"),
      title: t("studio.share.title"),
      // Stays mounted while hidden: it holds the saved project and a post in flight.
      content: (
        <ShareVideoDock
          key={post.dockKey}
          // Post shows unless a tool page has the slot (useRightSlot's priority).
          active={post.open && tool === null}
          title={handoff.videoTitle}
          canvasState={ready.canvas}
          ensureProjectId={ensurePostProject}
          afterPosted={<KitWhatsNext kit={kit} />}
          bare
        />
      ),
    },
    tool,
  };
}
