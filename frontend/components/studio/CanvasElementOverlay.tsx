// CanvasElementOverlay.tsx — interactive layer over the video canvas that
// shows draggable/resizable rectangles for each scene element. Selecting a
// rectangle drives the editor selection in the storyboard sidebar.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SceneElement, ElementBox } from "@/types/video-script";

interface Props {
  /** Elements for the currently visible scene. */
  elements: SceneElement[];
  /** Currently selected element id (controlled). */
  selectedId: string | null;
  /** Called when the user clicks a rectangle (or empty space → null). */
  onSelect: (id: string | null) => void;
  /** Called as the user drags or resizes — passes the updated box. */
  onUpdateBox: (id: string, box: ElementBox) => void;
}

type DragMode =
  | { type: "move"; startX: number; startY: number; origBox: ElementBox }
  | { type: "resize"; startX: number; startY: number; origBox: ElementBox; corner: "br" }
  | null;

function clampBox(b: ElementBox): ElementBox {
  // Keep at least 5% width/height and stay within 0-100
  const w = Math.max(5, Math.min(100, b.w));
  const h = Math.max(5, Math.min(100, b.h));
  const x = Math.max(0, Math.min(100 - w, b.x));
  const y = Math.max(0, Math.min(100 - h, b.y));
  return { x, y, w, h };
}

export default function CanvasElementOverlay({
  elements, selectedId, onSelect, onUpdateBox,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Filter to elements that have a visible box (audio elements have empty boxes)
  const visible = elements.filter(
    (el) => el.kind !== "audio" && el.box.w > 0 && el.box.h > 0,
  );

  // Mouse handlers — use the overlay's RENDERED size on screen so drag math
  // matches what the user sees.
  useEffect(() => {
    if (!drag || !activeId) return;

    function pixelsToPct(dxPx: number, dyPx: number): { dxPct: number; dyPct: number } {
      const rect = containerRef.current?.getBoundingClientRect();
      const w = rect?.width || 1;
      const h = rect?.height || 1;
      return {
        dxPct: (dxPx / w) * 100,
        dyPct: (dyPx / h) * 100,
      };
    }

    function onMove(e: MouseEvent) {
      if (!drag) return;
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      const { dxPct, dyPct } = pixelsToPct(dxPx, dyPx);

      let next: ElementBox;
      if (drag.type === "move") {
        next = { ...drag.origBox, x: drag.origBox.x + dxPct, y: drag.origBox.y + dyPct };
      } else {
        // resize from bottom-right
        next = { ...drag.origBox, w: drag.origBox.w + dxPct, h: drag.origBox.h + dyPct };
      }
      onUpdateBox(activeId!, clampBox(next));
    }

    function onUp() {
      setDrag(null);
      setActiveId(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, activeId, onUpdateBox]);

  function startDrag(e: React.MouseEvent, el: SceneElement) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    setActiveId(el.id);
    setDrag({
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      origBox: { ...el.box },
    });
  }

  function startResize(e: React.MouseEvent, el: SceneElement) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    setActiveId(el.id);
    setDrag({
      type: "resize",
      startX: e.clientX,
      startY: e.clientY,
      origBox: { ...el.box },
      corner: "br",
    });
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      // Empty-space click to deselect
      onClick={() => onSelect(null)}
    >
      {visible.map((el) => {
        const isSelected = selectedId === el.id;
        return (
          <div
            key={el.id}
            className={`absolute pointer-events-auto cursor-move transition-colors ${
              isSelected
                ? "border-2 border-primary bg-primary/5"
                : "border border-white/40 hover:border-white/80 bg-white/5 hover:bg-white/10"
            }`}
            style={{
              left: `${el.box.x}%`,
              top: `${el.box.y}%`,
              width: `${el.box.w}%`,
              height: `${el.box.h}%`,
            }}
            onMouseDown={(e) => startDrag(e, el)}
            onClick={(e) => { e.stopPropagation(); onSelect(el.id); }}
          >
            {/* Label badge */}
            <span className="absolute -top-5 left-0 px-1.5 py-0.5 text-[9px] font-medium bg-primary text-primary-foreground rounded whitespace-nowrap">
              {el.kind === "text"
                ? t("studio.canvas.textBadge", { text: el.text.slice(0, 12) })
                : el.kind === "image"
                ? t("studio.element.image")
                : el.kind === "video"
                ? t("studio.element.video")
                : t("studio.element.audio")}
            </span>

            {/* Resize handle (bottom-right) — only when selected */}
            {isSelected && (
              <div
                className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border border-white rounded-sm cursor-nwse-resize"
                onMouseDown={(e) => startResize(e, el)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
