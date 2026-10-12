/**
 * Length — how long the scene plays, and whether it is in the video at all
 * (the last scene left in can't be switched off). Dragging coalesces into
 * one undo step.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { isLastSceneOn, SCENE_SECONDS_MAX, SCENE_SECONDS_MIN } from "@shared/video-plan";
import { Switch } from "@/components/ui/switch";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import type { SceneDrillProps } from "../types";

export default function LengthDrill({ sceneId, scene, video, played, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  const id = useId();
  const on = !scene.off;
  const seconds = played.scene.duration;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor={id} className="text-[13px] text-foreground">
        {t("build.scene.length", { seconds })}
      </label>
      <input
        id={id}
        type="range"
        min={SCENE_SECONDS_MIN}
        max={SCENE_SECONDS_MAX}
        step={1}
        value={seconds}
        disabled={!on}
        onChange={(e) => onPatch({ duration: Number(e.target.value) }, `video:${sceneId}:length`)}
        className="h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label className="flex min-h-11 items-center justify-between gap-3 text-[13px]">
        <span>{t("build.sceneInspector.inVideo")}</span>
        <Switch
          checked={on}
          disabled={on && isLastSceneOn(video.plan, sceneId)}
          onCheckedChange={(checked) => onPatch({ off: checked ? undefined : true })}
          aria-label={t("build.story.inVideo", { scene: t(SCENE_LABEL_KEYS[sceneId]) })}
        />
      </label>
    </div>
  );
}
