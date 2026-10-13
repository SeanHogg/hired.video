/**
 * Scene inspector — the selected video scene in the right slot: its rows
 * (Simple: Words on screen · Voice · Length; Advanced appends the rest,
 * scene-drills.ts), or the open row's view in their place (the slot header
 * shows ‹ back, see useSceneSlotPanel).
 *
 * Every scene edit is checked against the plan schema before it commits, so
 * an edit the résumé row can't hold (an oversized effect chain) is refused
 * with a message instead of invalidating the whole video plan.
 */
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { patchScenePlan, ScenePlanSchema, type VideoSceneId } from "@shared/video-plan";
import type { BuildVideo, ScenePatch } from "@/lib/build/use-build-video";
import { resolveScenePalette } from "@/lib/build/scene-palette";
import { buildVideoOutline } from "@/lib/build/video-outline";
import { sceneCopy } from "@/lib/build/video-copy";
import { toast } from "@/hooks/use-toast";
import InspectorBody from "@/components/workspace/inspector/InspectorBody";
import { SCENE_DRILLS, type SceneDrillId } from "./scene-drills";
import type { SceneDrillProps } from "./types";

interface SceneInspectorProps {
  sceneId: VideoSceneId;
  content: ResumeContent;
  video: BuildVideo;
  advanced: boolean;
  /** The open row, or null for the rows. */
  drill: SceneDrillId | null;
  onDrill: (id: SceneDrillId) => void;
  onContentChange: (next: ResumeContent, group?: string) => void;
  onEditSource: (sectionKey: string) => void;
  onOpenSound: () => void;
}

export default function SceneInspector({ sceneId, content, video, advanced, drill, onDrill, onContentChange, onEditSource, onOpenSound }: SceneInspectorProps) {
  const { t } = useTranslation();
  const { plan, patchScene } = video;

  const onPatch = useCallback(
    (patch: ScenePatch, group?: string) => {
      const next = patchScenePlan(plan, sceneId, patch).scenes?.[sceneId];
      if (next && !ScenePlanSchema.safeParse(next).success) {
        toast({ title: t("build.sceneInspector.tooLarge"), variant: "destructive" });
        return;
      }
      patchScene(sceneId, patch, group);
    },
    [plan, sceneId, patchScene, t],
  );

  // The scene as it plays — computed with it switched on, so an off scene
  // can still be inspected and switched back in.
  const played = useMemo(() => {
    const outline = buildVideoOutline(content, patchScenePlan(plan, sceneId, { off: undefined }));
    const scene = outline.scenes.find((x) => x.id === sceneId) ?? outline.scenes[0];
    return { scene, copy: sceneCopy(scene, outline, t) };
  }, [content, plan, sceneId, t]);

  const ctx: SceneDrillProps = {
    sceneId,
    scene: plan.scenes?.[sceneId] ?? {},
    palette: resolveScenePalette(plan, sceneId, video.outline?.theme?.id ?? null),
    onPatch,
    video,
    played,
    content,
    onContentChange,
    onEditSource,
    onOpenSound,
  };

  return (
    <InspectorBody
      registry={SCENE_DRILLS}
      ctx={ctx}
      advanced={advanced}
      drill={drill}
      onOpen={onDrill}
      label={t("workspace.slot.thisScene")}
    />
  );
}
