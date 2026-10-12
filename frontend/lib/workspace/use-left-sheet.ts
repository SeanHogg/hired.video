/**
 * useLeftSheet — on phones the left tool panel and the right slot are both
 * bottom sheets; only ONE shows. Opening the tool sheet closes the slot, and
 * the slot opening (a canvas tap, Post, a tool page) closes the tool sheet.
 */
import { useCallback, useEffect, useState } from "react";

export function useLeftSheet(slotOpen: boolean, closeSlot: () => void, initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (slotOpen) setOpen(false);
  }, [slotOpen]);

  const setSheetOpen = useCallback(
    (next: boolean) => {
      if (next) closeSlot();
      setOpen(next);
    },
    [closeSlot],
  );

  return { sheetOpen: open, setSheetOpen };
}
