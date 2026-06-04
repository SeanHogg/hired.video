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
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";
import SceneThumbnail from "@/components/studio/shared/SceneThumbnail";
import UnitsRail from "./UnitsRail";

export interface ScenesRailProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onAdd: () => void;
  onDelete: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => void;
  onReorder: (nextOrderIds: string[]) => void;
}

export default function ScenesRail({
  scenes,
  activeSceneId,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  onReorder,
}: ScenesRailProps) {
  return (
    <UnitsRail
      title="Scenes"
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
          className="block w-full py-2 pr-2 text-left"
        >
          <div className="aspect-video w-full overflow-hidden rounded border border-border">
            <SceneThumbnail scene={scene} />
          </div>
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium">
            {index + 1}. {scene.label}
            <SceneNotesBadge notes={scene.directorNotes} />
          </p>
          <p className="text-[10px] text-muted-foreground">
            {scene.durationSeconds.toFixed(1)}s · {scene.widgets.length} widget
            {scene.widgets.length === 1 ? "" : "s"}
          </p>
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
  if (!notes) return null;
  return (
    <span
      title={notes}
      aria-label="Scene has director's notes"
      className="inline-flex"
    >
      <StickyNote className="h-3 w-3 shrink-0 text-amber-500" />
    </span>
  );
}
