/**
 * FloatingImageLayersPanel — image-kind layers chrome pinned to the
 * canvas-stage bottom-centre (alongside CanvasEditToolbar / ZoomControl).
 * Mirrors `<FloatingLayersPanel/>` (Timeline kinds) but mounts the
 * image-runtime layers body instead — wraps `<DrawingLayersPanel/>`
 * (raster layers + opacity + add / delete / reorder / visibility) in
 * the shared `<FloatingCollapsiblePanel/>` chrome.
 *
 * Per the standing DRY rule there is ONE floating-panel chrome
 * (pill + collapse + localStorage open-state); each kind plugs in its
 * own content. Adding a new layers-bearing kind = a new wrapper that
 * supplies its body to `FloatingCollapsiblePanel`.
 *
 * Self-gating: the host mounts this only when `mediaKind === "image"`,
 * so this component doesn't repeat the kind check. The image-state
 * passed in is non-null by construction (host gates on its presence).
 */
import { Layers as LayersIcon } from "lucide-react";
import type { ImageState, LayerBlendMode } from "@shared/image-state";
import FloatingCollapsiblePanel from "@/components/studio/v2/FloatingCollapsiblePanel";
import DrawingLayersPanel from "./DrawingLayersPanel";

export interface FloatingImageLayersPanelProps {
  state: ImageState;
  onAddLayer: () => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleVisible: (layerId: string) => void;
  onRenameLayer: (layerId: string, label: string) => void;
  onSetOpacity: (layerId: string, opacity: number) => void;
  /** Optional — when wired, the panel surfaces a per-layer blend-mode
   *  picker (#940 Image Phase 2). */
  onSetBlendMode?: (layerId: string, blendMode: LayerBlendMode) => void;
  /** Optional — when wired, the panel surfaces a per-layer filter
   *  chain (blur / brightness / contrast / saturate / hue / grayscale /
   *  invert) per #940 Image Phase 2. */
  onSetFilters?: (
    layerId: string,
    filters: import("@shared/image-state").LayerFilters | undefined,
  ) => void;
  onMoveLayer: (layerId: string, direction: "up" | "down") => void;
  className?: string;
}

export default function FloatingImageLayersPanel({
  state,
  className,
  ...handlers
}: FloatingImageLayersPanelProps) {
  return (
    <FloatingCollapsiblePanel
      label="Layers"
      Icon={LayersIcon}
      count={state.layers.length}
      // Distinct from the Timeline panel's storage key so each kind's
      // open-state persists independently — a user who likes the layers
      // panel open while painting shouldn't flip the Timeline editor's
      // open-state too.
      storageKey="studio.v2.floatingImageLayers.open"
      // Default to OPEN for drawing surfaces — the layer list is the
      // primary affordance for a Photoshop-shaped canvas, more central
      // than scenes-rail layers were on Timeline projects.
      defaultOpen
      // Wider body to accommodate the opacity slider that lives on each
      // active layer row.
      bodyWidthClass="w-72"
      className={className}
    >
      <DrawingLayersPanel state={state} {...handlers} />
    </FloatingCollapsiblePanel>
  );
}
