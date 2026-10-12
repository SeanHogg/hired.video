/**
 * Director's notes — free text for this scene. Never on screen; the chat's
 * rewrite of the scene follows it (api revise: the plan's `notes`, and the
 * focused scene's notes in the request). Typing coalesces into one undo step.
 */
import { useTranslation } from "react-i18next";
import { SCENE_NOTES_MAX } from "@shared/video-plan";
import { AutoSizeTextarea } from "@/components/studio/v2/inspector/fields";
import type { SceneDrillProps } from "../types";

export default function NotesDrill({ sceneId, scene, onPatch }: SceneDrillProps) {
  const { t } = useTranslation();
  const notes = scene.notes ?? "";
  return (
    <div className="flex flex-col gap-2">
      <AutoSizeTextarea
        value={notes}
        onChange={(next) => onPatch({ notes: next.slice(0, SCENE_NOTES_MAX) || undefined }, `video:${sceneId}:notes`)}
        minRows={5}
        placeholder={t("build.sceneInspector.notesPlaceholder")}
        ariaLabel={t("build.sceneInspector.drill.notes")}
      />
      <div className="flex items-start justify-between gap-3 text-[13px] text-muted-foreground">
        <p>{t("build.sceneInspector.notesHelp")}</p>
        <span className="flex-none tabular-nums" aria-hidden="true">
          {notes.length}/{SCENE_NOTES_MAX}
        </span>
      </div>
    </div>
  );
}
