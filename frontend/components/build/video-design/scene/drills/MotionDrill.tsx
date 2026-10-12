/**
 * Motion — how much this scene moves (the shared MotionTransitionPicker's
 * motion half over MOTION_PRESETS). Moderate is the derived timing, so it
 * clears the override.
 */
import { useTranslation } from "react-i18next";
import MotionTransitionPicker from "@/components/studio/shared/MotionTransitionPicker";
import type { SceneDrillProps } from "../types";

export default function MotionDrill({ scene, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <MotionTransitionPicker
        activeMotion={scene.motion ?? "moderate"}
        activeTransition={null}
        onSelectMotion={(preset) => onPatch({ motion: preset.id === "moderate" ? undefined : preset.id })}
      />
      <p className="text-[13px] text-muted-foreground">{t("build.sceneInspector.motionHelp")}</p>
    </div>
  );
}
