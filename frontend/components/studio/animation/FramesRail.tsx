/**
 * FramesRail — the animation kind's left-side list of frames. A frame is
 * the animation analogue of a Scene (video) or a Level (game): the
 * ordered unit the user authors. Per the studio's consistent-rail
 * convention this list lives in the LEFT panel — NOT embedded at the
 * bottom of the canvas, where it used to live and where it diverged from
 * every other kind (the user's report). A thin wrapper over the generic
 * `<UnitsRail>`: it supplies the frame-shaped card body (pixel thumbnail
 * + index badge + hold-count badge) and forwards mutations through the
 * pure helpers in `shared/animation-state.ts`. Add / Duplicate / Delete /
 * reorder + the active ring + drag handle all come from `<UnitsRail>` so
 * Frames stay consistent with Scenes and Levels (DRY:
 * `feedback_extract_on_duplication`).
 */
import {
  type AnimationState,
  insertFrameAfter,
  duplicateFrame,
  removeFrame,
} from "@shared/animation-state";
import { cn } from "@/lib/utils";
import UnitsRail from "@/components/studio/v2/UnitsRail";

export interface FramesRailProps {
  state: AnimationState;
  /** Structural change (add / duplicate / delete / reorder) — the host
   *  wraps this to push a history checkpoint. */
  onChange: (next: AnimationState) => void;
  /** Selection change — ephemeral, the host applies it without a history
   *  checkpoint (matches how scene / level selection behaves). */
  onSelect: (frameId: string) => void;
}

export default function FramesRail({ state, onChange, onSelect }: FramesRailProps) {
  const { frames, activeFrameId } = state;

  function handleAdd() {
    onChange(insertFrameAfter(state, activeFrameId).state);
  }

  function handleDuplicate(frameId: string) {
    onChange(duplicateFrame(state, frameId).state);
  }

  function handleDelete(frameId: string) {
    onChange(removeFrame(state, frameId));
  }

  function handleReorder(orderedIds: string[]) {
    const byId = new Map(frames.map((f) => [f.id, f]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((f): f is (typeof frames)[number] => f != null);
    if (next.length !== frames.length) return;
    onChange({ ...state, frames: next });
  }

  return (
    <UnitsRail
      title="Frames"
      unitNoun="frame"
      units={frames}
      getId={(f) => f.id}
      getLabel={(_f, i) => `Frame ${i + 1}`}
      activeId={activeFrameId}
      onSelect={onSelect}
      onAdd={handleAdd}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onReorder={handleReorder}
      renderBody={({ unit: frame, index, onSelect: selectFrame }) => (
        <button
          type="button"
          onClick={selectFrame}
          className="relative block w-full p-2"
          aria-label={`Select frame ${index + 1}`}
        >
          <div
            className={cn(
              "flex aspect-video w-full items-center justify-center overflow-hidden rounded border border-border bg-card text-[10px] text-muted-foreground",
            )}
          >
            {frame.pixelsDataUrl ? (
              <img
                src={frame.pixelsDataUrl}
                alt={`Frame ${index + 1}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <span>Empty</span>
            )}
          </div>
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
            {index + 1}
          </span>
          {(frame.hold ?? 1) > 1 ? (
            <span className="absolute bottom-1 right-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
              ×{frame.hold}
            </span>
          ) : null}
        </button>
      )}
    />
  );
}
