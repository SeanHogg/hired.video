/**
 * Palette & fonts — the scene's colour look (LookSwatches), its colours set
 * by hand over that look (background start / end, accent), and its font
 * (the studio's FontPicker over the shared font catalog).
 */
import { useTranslation } from "react-i18next";
import type { SceneLook } from "@/lib/build/scene-palette";
import LookSwatches from "@/components/build/LookSwatches";
import FontPicker from "@/components/studio/shared/FontPicker";
import { ColorInput, Field } from "@/components/studio/v2/inspector/fields";
import { INSPECTOR_LABEL, INSPECTOR_RESET } from "@/components/workspace/inspector/inspector-styles";
import type { SceneDrillProps } from "../types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOUR_FIELDS: Array<{ key: keyof SceneLook; labelKey: string }> = [
  { key: "from", labelKey: "build.sceneInspector.colourFrom" },
  { key: "to", labelKey: "build.sceneInspector.colourTo" },
  { key: "accent", labelKey: "build.sceneInspector.colourAccent" },
];

export default function PaletteFontsDrill({ sceneId, scene, palette, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  const setColour = (key: keyof SceneLook, hex: string) => {
    if (!HEX.test(hex)) return;
    onPatch({ palette: { ...(scene.palette ?? {}), [key]: hex } }, `video:${sceneId}:palette`);
  };
  return (
    <div className="flex flex-col gap-5">
      {/* A look replaces the hand colours, so the look shows as picked. */}
      <LookSwatches
        legend={t("build.scene.look")}
        legendClassName={INSPECTOR_LABEL}
        value={scene.palette ? null : (scene.look ?? null)}
        onPick={(look) => onPatch({ look, palette: undefined })}
      />
      <section className="flex flex-col gap-3">
        <h3 className={INSPECTOR_LABEL}>{t("build.sceneInspector.paletteColours")}</h3>
        {COLOUR_FIELDS.map(({ key, labelKey }) => (
          <Field key={key} label={t(labelKey)}>
            <ColorInput value={palette[key]} onChange={(hex) => setColour(key, hex)} />
          </Field>
        ))}
        <button type="button" className={INSPECTOR_RESET} disabled={!scene.palette} onClick={() => onPatch({ palette: undefined })}>
          {t("build.sceneInspector.resetColours")}
        </button>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className={INSPECTOR_LABEL}>{t("build.sceneInspector.font")}</h3>
        <FontPicker activeFontId={scene.font ?? null} onSelect={(preset) => onPatch({ font: preset.id })} />
        <button type="button" className={INSPECTOR_RESET} disabled={!scene.font} onClick={() => onPatch({ font: undefined })}>
          {t("build.sceneInspector.defaultFont")}
        </button>
      </section>
    </div>
  );
}
