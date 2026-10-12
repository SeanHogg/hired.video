/**
 * Words on screen — the scene's words, LINKED to the page: typing edits the
 * résumé where the scene has a page source (SceneWordingFields →
 * scene-text.ts) and keeps its own wording only where there is none. The
 * Proof scene also picks which roles it shows. "Edit on the page" jumps to
 * the section the scene is built from.
 */
import { useTranslation } from "react-i18next";
import { PROOF_ROLES_MAX } from "@shared/video-plan";
import { proofRoleOptions, SCENE_SOURCE_SECTION, selectedProofRoleKeys } from "@/lib/build/video-outline";
import { sectionLabelKey } from "@/lib/build/editable-sections";
import { cn } from "@/lib/utils";
import SceneWordingFields from "@/components/build/SceneWordingFields";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";
import type { SceneDrillProps } from "../types";

export default function WordsDrill({ sceneId, video, played, content, onPatch, onContentChange, onEditSource }: SceneDrillProps) {
  const { t } = useTranslation();
  const { plan } = video;
  const source = SCENE_SOURCE_SECTION[sceneId];
  const roles = sceneId === "proof" ? proofRoleOptions(content) : [];
  const picked = sceneId === "proof" ? selectedProofRoleKeys(content, plan) : [];
  const toggleRole = (key: string, checked: boolean) => {
    const next = checked ? [...picked, key] : picked.filter((k) => k !== key);
    // Keep authored (newest-first) order so the page reads like the résumé.
    const ordered = roles.map((r) => r.key).filter((k) => next.includes(k));
    onPatch({ roles: ordered.length > 0 ? ordered : undefined });
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-muted px-3 py-1">
        <span className="text-[13px] text-foreground/80">{t("build.scene.builtFrom", { section: t(sectionLabelKey(source)) })}</span>
        <button
          type="button"
          onClick={() => onEditSource(source)}
          className="min-h-11 text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("build.scene.editOnPage")}
        </button>
      </div>
      {sceneId === "proof" && roles.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className={cn(INSPECTOR_LABEL, "mb-1")}>{t("build.scene.roles", { max: PROOF_ROLES_MAX })}</legend>
          {roles.map((role) => {
            const checked = picked.includes(role.key);
            const disabled = (checked && picked.length === 1) || (!checked && picked.length >= PROOF_ROLES_MAX);
            return (
              <label key={role.key} className={cn("flex min-h-11 items-center gap-2.5", disabled && !checked && "opacity-60")}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => toggleRole(role.key, e.target.checked)}
                  className="h-4 w-4 flex-none accent-primary"
                />
                <span className="min-w-0 break-words">{[role.position, role.company].filter(Boolean).join(" · ")}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      <SceneWordingFields
        scene={played.scene}
        copy={played.copy}
        content={content}
        onPatch={onPatch}
        onContentChange={onContentChange}
        showLabel={false}
      />
    </div>
  );
}
