/**
 * The studio editor's right-slot panels, composed at render time: the
 * kind's inspector (from the format surface) and the Post panel. The slot's
 * open state is `useStudioRightSlot` (lib/studio/editor-v2).
 */
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { MediaKind } from "@shared/media-kinds";
import type { SlotPanel } from "@/components/workspace/RightSlot";
import StudioPostPanel from "@/components/workspace/studio/StudioPostPanel";
import type { RightSlotState } from "@/lib/workspace/use-right-slot";
import { canPostKind } from "@/lib/studio/share-channels";
import type { PublishHandlers } from "@/lib/studio/use-publish-handlers";
import { type CanvasState, totalDurationSeconds } from "@/lib/studio/editor-v2/canvas-state";
import type { StudioInspector } from "@/components/studio/v2/surfaces/types";

export interface StudioSlotPanelsInput {
  t: TFunction;
  slot: RightSlotState;
  currentMediaKind: MediaKind;
  /** The kind's inspector (title + body; kicker + ‹ back when a section
   *  is open in place), or null when it has none. */
  inspector: StudioInspector | null;
  setShareOpen: Dispatch<SetStateAction<boolean>>;
  title: string;
  publisher: PublishHandlers;
  persistedProjectId: string | null;
  state: CanvasState;
}

// ───── The right slot: the kind's inspector (and the Post panel).
export function studioSlotPanels({
  t,
  slot,
  currentMediaKind,
  inspector,
  setShareOpen,
  title,
  publisher,
  persistedProjectId,
  state,
}: StudioSlotPanelsInput): Partial<Record<"inspector" | "post", SlotPanel | null>> {
  return {
    inspector: inspector ? { kicker: t("workspace.slot.inspector"), ...inspector } : null,
    post: canPostKind(currentMediaKind)
      ? {
          kicker: t("workspace.slot.post"),
          title: t("studio.share.title"),
          content: (
            <StudioPostPanel
              open={slot.active === "post"}
              onOpenChange={setShareOpen}
              mediaKind={currentMediaKind}
              title={title}
              publisher={publisher}
              projectId={persistedProjectId}
              durationSec={totalDurationSeconds(state)}
              frame={{ width: state.width, height: state.height }}
            />
          ),
        }
      : null,
  };
}
