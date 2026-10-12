/**
 * useDragToClose — drag a bottom sheet's grabber down past a threshold to
 * close it (phones). Returns pointer handlers for the handle and the live
 * offset to translate the sheet by while dragging.
 */
import { useCallback, useRef, useState, type PointerEvent } from "react";

const CLOSE_AFTER_PX = 80;

export function useDragToClose(onClose: () => void) {
  const startY = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (startY.current === null) return;
    setOffset(Math.max(0, e.clientY - startY.current));
  }, []);

  const onPointerUp = useCallback(() => {
    if (startY.current === null) return;
    startY.current = null;
    setOffset((dragged) => {
      if (dragged > CLOSE_AFTER_PX) onClose();
      return 0;
    });
  }, [onClose]);

  return {
    offset,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, style: { touchAction: "none" as const } },
  };
}
