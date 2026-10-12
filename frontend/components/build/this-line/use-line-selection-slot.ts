/**
 * Ties the kit's line selection to the right slot: selecting a résumé line
 * (a click on the page, a finding flag) shows the inspector — "This line" —
 * and ✕ on the inspector clears the selection, so the slot falls back to
 * what the stage shows beside the page. A tool page or Post keep priority
 * (useRightSlot); closing those leaves the selection alone.
 */
import { useCallback, useEffect } from "react";
import type { RightSlotState } from "@/lib/workspace/use-right-slot";
import { useKitLineSelection } from "@/lib/workspace/kit/use-kit-line-selection";

export function useLineSelectionSlot(slot: RightSlotState): RightSlotState {
  const { line, clear } = useKitLineSelection();
  const { openInspector, close, active } = slot;
  useEffect(() => {
    if (line) openInspector();
  }, [line, openInspector]);
  const closeSlot = useCallback(() => {
    if (active === "inspector") clear();
    close();
  }, [active, clear, close]);
  return { ...slot, close: closeSlot };
}
