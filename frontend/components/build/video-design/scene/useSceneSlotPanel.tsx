/**
 * useSceneSlotPanel — the kit video's "This scene" panel for the ONE right
 * slot: the selected scene's rows (Simple, + the Advanced rows), or an open
 * row with ‹ back to the rows.
 *
 * The open row belongs to the scene it was opened on: selecting another
 * scene (strip or canvas) shows that scene's rows again, and Simple depth
 * never shows an Advanced row (useInspectorDrill).
 */
import { useTranslation } from "react-i18next";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { SlotPanel } from "@/components/workspace/RightSlot";
import { drillSlotHeader } from "@/components/workspace/inspector/InspectorBody";
import { useInspectorDrill } from "@/components/workspace/inspector/use-inspector-drill";
import { INSPECTOR_PAD } from "@/components/workspace/inspector/inspector-styles";
import SceneInspector from "./SceneInspector";
import { SCENE_DRILLS } from "./scene-drills";

export function useSceneSlotPanel(kit: KitWorkspace, advanced: boolean): SlotPanel | null {
  const { t } = useTranslation();
  const { ready, video, nav } = kit;
  const sceneId = video.selected;
  const { drill, open, back } = useInspectorDrill(SCENE_DRILLS, sceneId, advanced);
  if (!ready) return null;

  const header = drillSlotHeader({
    t,
    registry: SCENE_DRILLS,
    drill,
    onBack: back,
    kicker: t("workspace.slot.thisScene"),
    title: t(SCENE_LABEL_KEYS[sceneId]),
  });
  return {
    ...header,
    content: (
      <div className={INSPECTOR_PAD}>
        <SceneInspector
          sceneId={sceneId}
          content={ready.content}
          video={video}
          advanced={advanced}
          drill={drill}
          onDrill={open}
          onContentChange={kit.history.commit}
          onEditSource={nav.editFromPage}
          onOpenSound={() => kit.panel.show("media")}
        />
      </div>
    ),
  };
}
