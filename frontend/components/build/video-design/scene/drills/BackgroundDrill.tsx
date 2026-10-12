/**
 * Background — the scene's ground: a studio background preset (the shared
 * BackgroundPicker), or one solid colour. "Use the scene's colours" goes
 * back to the palette's gradient.
 */
import { useTranslation } from "react-i18next";
import BackgroundPicker from "@/components/studio/shared/BackgroundPicker";
import { ColorInput, Field } from "@/components/studio/v2/inspector/fields";
import { sceneGround } from "@/lib/build/scene-overrides";
import { INSPECTOR_RESET } from "@/components/workspace/inspector/inspector-styles";
import type { SceneDrillProps } from "../types";

export default function BackgroundDrill({ sceneId, scene, palette, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  const ground = sceneGround(palette, scene.background);
  return (
    <div className="flex flex-col gap-4">
      <BackgroundPicker
        activeBgValue={scene.background ?? null}
        activeHex={ground.fill}
        onSelect={(preset) => onPatch({ background: preset.value })}
      />
      <Field label={t("build.sceneInspector.solidColour")}>
        <ColorInput
          value={ground.fill}
          onChange={(hex) => /^#[0-9a-fA-F]{6}$/.test(hex) && onPatch({ background: `solid:${hex}` }, `video:${sceneId}:background`)}
        />
      </Field>
      <button type="button" className={INSPECTOR_RESET} disabled={!scene.background} onClick={() => onPatch({ background: undefined })}>
        {t("build.sceneInspector.useSceneColours")}
      </button>
    </div>
  );
}
