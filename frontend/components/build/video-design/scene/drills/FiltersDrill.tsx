/**
 * Filters & effects — the scene's colour grading (the shared FiltersPicker)
 * and its effect chain (the studio's EffectStackEditor, scene categories
 * only). Identity filters / an empty chain clear the override.
 */
import { useTranslation } from "react-i18next";
import FiltersPicker from "@/components/studio/shared/FiltersPicker";
import EffectStackEditor from "@/components/studio/effects/EffectStackEditor";
import { isIdentityFilters } from "@/lib/studio/video-filters";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";
import type { SceneDrillProps } from "../types";

/** Effects that make sense on a whole scene (title effects belong on text). */
const SCENE_EFFECT_CATEGORIES = ["color", "stylize"];

export default function FiltersDrill({ sceneId, scene, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className={INSPECTOR_LABEL}>{t("build.sceneInspector.filters")}</h3>
        <FiltersPicker
          filters={scene.filters ?? null}
          onChange={(next) => onPatch({ filters: isIdentityFilters(next) ? undefined : next }, `video:${sceneId}:filters`)}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className={INSPECTOR_LABEL}>{t("build.sceneInspector.effects")}</h3>
        <EffectStackEditor
          effects={scene.effects ?? []}
          onChange={(next) => onPatch({ effects: next.length > 0 ? next : undefined }, `video:${sceneId}:effects`)}
          allowedCategories={SCENE_EFFECT_CATEGORIES}
          compact
        />
      </section>
    </div>
  );
}
