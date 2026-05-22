/**
 * FloatingLayersPanel — collapsible "Layers" affordance pinned to the
 * canvas-stage chrome (alongside CanvasEditToolbar / ZoomControl).
 *
 * Layers are scoped to the active scene's canvas, so they belong next
 * to the surface they act on — not in the left-rail tabs that also host
 * project-wide concerns (Widgets / Media / Actions). Collapsed renders
 * as a Layers pill; expanded reveals the full LayersPanel anchored
 * above the pill with a fixed max-height so it never crowds the canvas.
 *
 * Self-gating per DRY: when the scene has zero widgets the trigger
 * still renders (so users discover where the panel lives) but the
 * count chip is suppressed. Expanded state persists across reloads
 * via localStorage so the user's preferred chrome stays put.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Layers as LayersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import LayersPanel from "./LayersPanel";
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";

const STORAGE_KEY = "studio.v2.floatingLayers.open";

export interface FloatingLayersPanelProps {
  scene: Scene;
  selectedWidgetId: string | null;
  onSelectWidget: (widgetId: string) => void;
  onReorderLayers: (widgetIds: string[]) => void;
  className?: string;
}

function readPersistedOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function FloatingLayersPanel({
  scene,
  selectedWidgetId,
  onSelectWidget,
  onReorderLayers,
  className,
}: FloatingLayersPanelProps) {
  const [open, setOpen] = useState<boolean>(() => readPersistedOpen());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const count = scene.widgets.length;

  return (
    <div className={cn("pointer-events-auto flex flex-col items-center", className)}>
      {open && (
        <div className="mb-1 w-64 overflow-hidden rounded-md border border-border bg-card/95 shadow-md backdrop-blur">
          <div className="max-h-72 overflow-hidden">
            <LayersPanel
              scene={scene}
              selectedWidgetId={selectedWidgetId}
              onSelectWidget={onSelectWidget}
              onReorderLayers={onReorderLayers}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Collapse layers" : "Expand layers"}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-sm backdrop-blur transition hover:bg-muted",
          open && "text-foreground",
        )}
      >
        <LayersIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">Layers</span>
        {count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
