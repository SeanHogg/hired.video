/**
 * The workspace frame's ONE right slot for a studio format — the kind's
 * inspector, or the Post panel — and the phone tool sheet. A studio format
 * has no tool pages. Its panels are composed at render time by
 * `studioSlotPanels` (components/studio/v2/editor). Lifted out of
 * StudioEditorV2.
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { MediaKind } from "@shared/media-kinds";
import { useRightSlot } from "@/lib/workspace/use-right-slot";
import { useLeftSheet } from "@/lib/workspace/use-left-sheet";
import { canPostKind } from "@/lib/studio/share-channels";

/** Studio formats open no AI Tool pages in the right slot. */
const NO_TOOL_PAGE = { open: false, close: () => undefined };

export interface StudioRightSlotInput {
  currentMediaKind: MediaKind;
  /** The format has an inspector right now (the format-runtime descriptor's
   *  `hasInspector` — the same decision the format surface reads). */
  hasInspector: boolean;
  /** Wide viewport — the inspector starts open. */
  wide: boolean;
  shareOpen: boolean;
  setShareOpen: Dispatch<SetStateAction<boolean>>;
}

export function useStudioRightSlot({
  currentMediaKind,
  hasInspector,
  wide,
  shareOpen,
  setShareOpen,
}: StudioRightSlotInput) {
  // ───── The workspace frame's ONE right slot (the kind's inspector, or the
  // Post panel) and the phone tool sheet — declared before the early
  // returns (hooks). A studio format has no tool pages.
  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  const slot = useRightSlot({
    tool: NO_TOOL_PAGE,
    post: canPostKind(currentMediaKind) ? { open: shareOpen, show: openShare, close: closeShare } : null,
    hasInspector,
    initialInspectorOpen: wide,
  });
  const { sheetOpen: toolSheetOpen, setSheetOpen: setToolSheetOpen } = useLeftSheet(slot.active !== null, slot.close);
  return { slot, toolSheetOpen, setToolSheetOpen };
}
