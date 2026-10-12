/**
 * The selected scene's words — its headline and each line as its own field,
 * so every field maps to ONE thing on the résumé (lib/build/scene-text.ts).
 *
 * While the scene follows the résumé, typing here edits the page (the hook's
 * bullet, the name, the lead role, a skill …) and the scene follows. Fields
 * without a page source — and a scene already unlinked — keep the owner's
 * own wording for the video only; "Use the résumé's wording" links it again.
 * Every keystroke in a scene coalesces into one undo step (`group`).
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { SCENE_LINES_MAX } from "@shared/video-plan";
import { writeShownSceneText, type SceneTextField } from "@/lib/build/scene-text";
import type { VideoOutlineScene } from "@/lib/build/video-outline";
import type { SceneCopy } from "@/lib/build/video-copy";
import type { ScenePatch } from "@/lib/build/use-build-video";
import { cn } from "@/lib/utils";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";

interface SceneWordingFieldsProps {
  /** The scene as it plays (built with it switched on). */
  scene: VideoOutlineScene;
  /** Its on-screen copy — what the fields show. */
  copy: SceneCopy;
  content: ResumeContent;
  onPatch: (patch: ScenePatch, group?: string) => void;
  onContentChange: (next: ResumeContent, group?: string) => void;
  /** False when a parent already names the fields (the scene inspector's
   *  "Words on screen" question). */
  showLabel?: boolean;
}

const FIELD =
  "w-full min-h-11 rounded-[10px] border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** Longest wording a scene field takes (the plan's override limit). */
const TEXT_MAX = 160;

export default function SceneWordingFields({ scene, copy, content, onPatch, onContentChange, showLabel = true }: SceneWordingFieldsProps) {
  const { t } = useTranslation();
  const ids = useId();
  const sceneId = scene.id;

  // Linked Skills shows every skill (each renames one); otherwise the plan's
  // line limit, with one empty row to add a line while there is room.
  const shown = sceneId === "skills" && scene.linked ? copy.body : copy.body.slice(0, SCENE_LINES_MAX);
  const rows = shown.length < SCENE_LINES_MAX ? [...shown, ""] : shown;

  // Localized copy on screen (Next, the Skills heading) is frozen into the
  // plan before the first edit — the same write the on-frame editor uses.
  const write = (field: SceneTextField, text: string) =>
    onContentChange(writeShownSceneText(content, sceneId, field, text, copy), `video:${sceneId}:text`);

  const status = !scene.linked
    ? t("build.scene.videoOnly")
    : sceneId === "next"
      ? t("build.scene.followsResumeVideoOnly")
      : t("build.scene.followsResume");

  return (
    <div className="flex flex-col gap-2">
      {showLabel && <span className={INSPECTOR_LABEL}>{t("build.scene.wording")}</span>}
      <p className={cn("rounded-[10px] px-3 py-2 text-xs", scene.linked ? "bg-muted text-foreground/80" : "border border-border bg-card text-muted-foreground")}>
        {status}
      </p>

      <label htmlFor={`${ids}-heading`} className="sr-only">
        {t("build.scene.heading")}
      </label>
      <input
        id={`${ids}-heading`}
        type="text"
        value={copy.heading}
        maxLength={TEXT_MAX}
        placeholder={t("build.scene.heading")}
        onChange={(e) => write({ kind: "heading" }, e.target.value)}
        className={cn(FIELD, "font-semibold")}
      />

      {rows.map((value, index) => {
        const id = `${ids}-line-${index}`;
        const isNew = index >= shown.length;
        return (
          <div key={index}>
            <label htmlFor={id} className="sr-only">
              {isNew ? t("build.scene.addLine") : t("build.scene.line", { n: index + 1 })}
            </label>
            <input
              id={id}
              type="text"
              value={value}
              maxLength={TEXT_MAX}
              placeholder={isNew ? t("build.scene.addLine") : t("build.scene.line", { n: index + 1 })}
              onChange={(e) => write({ kind: "line", index }, e.target.value)}
              className={FIELD}
            />
          </div>
        );
      })}

      {!scene.linked && (
        <button
          type="button"
          onClick={() => onPatch({ title: undefined, lines: undefined })}
          className="min-h-11 self-start text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("build.scene.relink")}
        </button>
      )}
    </div>
  );
}
