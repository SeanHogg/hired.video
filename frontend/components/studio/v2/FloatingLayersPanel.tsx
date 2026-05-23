/**
 * FloatingLayersPanel — Timeline-runtime layers chrome pinned to the
 * canvas stage (alongside CanvasEditToolbar / ZoomControl). For image-
 * kind projects the host mounts `<FloatingImageLayersPanel/>` in the
 * same slot instead; the underlying pill / collapse / persistence
 * chrome is shared (DRY — see [FloatingCollapsiblePanel.tsx](./FloatingCollapsiblePanel.tsx)).
 *
 * Layers are scoped to the active scene's canvas, so they belong next
 * to the surface they act on — not in the left-rail tabs that also host
 * project-wide concerns (Widgets / Media / Actions).
 *
 * Per DRY: this component now only owns the Timeline-specific content
 * (scene widgets) + the props plumbing. The pill / expand / count chip
 * + localStorage persistence comes from `<FloatingCollapsiblePanel/>`.
 */
import { Layers as LayersIcon } from "lucide-react";
import LayersPanel from "./LayersPanel";
import FloatingCollapsiblePanel from "./FloatingCollapsiblePanel";
import type { Scene } from "@/lib/studio/editor-v2/canvas-state";

export interface FloatingLayersPanelProps {
  scene: Scene;
  selectedWidgetId: string | null;
  onSelectWidget: (widgetId: string) => void;
  onReorderLayers: (widgetIds: string[]) => void;
  className?: string;
}

export default function FloatingLayersPanel({
  scene,
  selectedWidgetId,
  onSelectWidget,
  onReorderLayers,
  className,
}: FloatingLayersPanelProps) {
  return (
    <FloatingCollapsiblePanel
      label="Layers"
      Icon={LayersIcon}
      count={scene.widgets.length}
      storageKey="studio.v2.floatingLayers.open"
      className={className}
    >
      <LayersPanel
        scene={scene}
        selectedWidgetId={selectedWidgetId}
        onSelectWidget={onSelectWidget}
        onReorderLayers={onReorderLayers}
      />
    </FloatingCollapsiblePanel>
  );
}
