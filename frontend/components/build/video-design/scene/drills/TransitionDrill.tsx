/**
 * Transition in — how this scene comes in (the shared TransitionInPicker);
 * "the video's default" clears the override.
 */
import { useTranslation } from "react-i18next";
import TransitionInPicker from "@/components/studio/shared/TransitionInPicker";
import type { SceneDrillProps } from "../types";

export default function TransitionDrill({ scene, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <TransitionInPicker
        value={scene.transitionIn ?? null}
        inheritLabel={t("build.sceneInspector.transitionDefault")}
        onChange={(next) => onPatch({ transitionIn: next ?? undefined })}
      />
      <p className="text-[13px] text-muted-foreground">{t("build.sceneInspector.transitionHelp")}</p>
    </div>
  );
}
