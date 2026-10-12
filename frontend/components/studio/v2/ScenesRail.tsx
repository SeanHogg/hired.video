/**
 * Scene thumbnail rail — the video / podcast / voice / comic kinds'
 * left-side list of scenes. A thin wrapper over the generic
 * `<UnitsRail>`: it supplies the scene-shaped card body (thumbnail +
 * label + duration + widget count + director-notes badge) and forwards
 * the mutation callbacks. All the dnd-kit sortable plumbing, the active
 * ring, the Add header, and the Duplicate/Delete cluster live in
 * `<UnitsRail>` so Scenes / Levels / Frames can't drift apart (DRY:
 * `feedback_extract_on_duplication`).
 */
import { StickyNote } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";
import SceneThumbnail from "@/components/studio/shared/SceneThumbnail";
import { DRAG_MIME, readDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import UnitsRail from "./UnitsRail";

export interface ScenesRailProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onAdd: () => void;
  onDelete: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => void;
  onReorder: (nextOrderIds: string[]) => void;
  /** #589 — drop a background preset onto a specific scene tile to re-skin
   *  THAT scene (the canvas drop target only ever hits the active scene).
   *  `bgValue` is the encoded `BgPreset.value`. */
  onBackgroundDrop?: (sceneId: string, bgValue: string) => void;
}

export default function ScenesRail({
  scenes,
  activeSceneId,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  onReorder,
  onBackgroundDrop,
}: ScenesRailProps) {
  const { t } = useTranslation();
  const longest = scenes.reduce((max, s) => Math.max(max, s.durationSeconds), 0);
  return (
    <UnitsRail
      title={t("studio.editor.panelScenes")}
      unitNoun="scene"
      units={scenes}
      getId={(s) => s.id}
      getLabel={(s) => s.label}
      activeId={activeSceneId}
      onSelect={onSelect}
      onAdd={onAdd}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onReorder={onReorder}
      renderBody={({ unit: scene, index, onSelect: selectScene }) => (
        <button
          type="button"
          onClick={selectScene}
          className="flex w-full items-center gap-2.5 py-1.5 pr-2 text-left"
          // #589 — make each tile a background drop target. Only react to
          // the background drag kind so scene-reorder (dnd-kit, pointer)
          // and other HTML5 drags pass through untouched.
          onDragOver={
            onBackgroundDrop
              ? (e) => {
                  if (e.dataTransfer.types.includes(DRAG_MIME.background)) {
                    e.preventDefault();
                  }
                }
              : undefined
          }
          onDrop={
            onBackgroundDrop
              ? (e) => {
                  const payload = readDragPayload(e.dataTransfer);
                  if (payload?.kind !== "background") return;
                  e.preventDefault();
                  e.stopPropagation();
                  onBackgroundDrop(scene.id, payload.data);
                }
              : undefined
          }
        >
          <span className="relative block aspect-video w-[88px] shrink-0 overflow-hidden rounded-md bg-ink">
            <SceneThumbnail scene={scene} />
            {/* Blue hairline = this scene's share of the longest scene's
                duration — a glanceable pacing cue (visual only). */}
            <span
              aria-hidden="true"
              className="absolute bottom-1.5 left-1.5 h-1 rounded-sm bg-ink-accent"
              style={{ width: `calc((100% - 12px) * ${durationShare(scene, longest)})` }}
            />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="flex items-center gap-1 truncate text-[13px] font-semibold text-foreground">
              <span className="truncate">
                {index + 1}. {scene.label}
              </span>
              <SceneNotesBadge notes={scene.directorNotes} />
            </strong>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {t("studio.rail.sceneMeta", {
                seconds: Number(scene.durationSeconds.toFixed(1)),
                count: scene.widgets.length,
              })}
            </span>
          </span>
        </button>
      )}
    />
  );
}

/** Indicator chip surfaced on each scene thumbnail when the director has
 *  attached notes. Self-gates per DRY: returns null when notes are empty
 *  so consumers don't gate visibility themselves. Hover surfaces the
 *  notes preview via the native title tooltip. */
function SceneNotesBadge({ notes }: { notes: string | null | undefined }) {
  const { t } = useTranslation();
  if (!notes) return null;
  return (
    <span
      title={notes}
      aria-label={t("studio.rail.hasDirectorNotes")}
      className="inline-flex"
    >
      <StickyNote className="h-3 w-3 shrink-0 text-amber-500" />
    </span>
  );
}

/** 0..1 share of the longest scene's duration (min 0.15 so a short scene
 *  still shows a visible hairline). */
function durationShare(scene: Scene, longest: number): number {
  if (longest <= 0) return 1;
  return Math.max(0.15, Math.min(1, scene.durationSeconds / longest));
}
