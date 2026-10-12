/**
 * useKitElementTools — the Elements and Layers rail tools (Advanced) for
 * whatever a kit page adds free elements to: the studio's own WidgetPalette
 * (under the upload gate) and its LayersPanel. ONE wiring for the video frame
 * and the résumé / letter pages; each page supplies a KitElementTarget
 * adapter (useKitVideoElementTarget / useKitDocumentElementTarget). Null
 * target → both tools grey out.
 */
import type { ReactNode } from "react";
import type { Scene, WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import { AnonGateContext, type AnonGateValue } from "@/lib/studio/anon-gate-context";
import WidgetPalette from "@/components/studio/v2/WidgetPalette";
import LayersPanel, { type LayerVisibility } from "@/components/studio/v2/LayersPanel";

/** How a page takes new elements and lists its layers. */
export interface KitElementTarget {
  mediaKind: "video" | "document";
  /** The scene new elements land in (palette anchor). */
  activeSceneId: string;
  /** The layers to list (null: nothing to restack yet). */
  scene: Scene | null;
  selectedId: string | null;
  uploadGate: AnonGateValue;
  insert: (kind: WidgetKind) => void;
  insertLinked: (kind: LinkedContentKind, id: string) => void;
  insertMedia: (kind: "image" | "video", url: string) => void;
  /** Upload-gated screenshot (useGatedScreenshot). */
  captureScreenshot: () => void;
  reorder: (ids: string[]) => void;
  select: (id: string) => void;
  /** Hide / lock per layer (document pages). */
  visibility?: LayerVisibility;
}

export function useKitElementTools(target: KitElementTarget | null): { elements: ReactNode | null; layers: ReactNode | null } {
  if (!target) return { elements: null, layers: null };
  return {
    elements: (
      <AnonGateContext.Provider value={target.uploadGate}>
        <WidgetPalette
          section="all"
          mediaKind={target.mediaKind}
          activeSceneId={target.activeSceneId}
          onInsert={target.insert}
          onInsertLinkedContent={target.insertLinked}
          onCaptureScreenshot={target.captureScreenshot}
          onAddImageWidget={(url) => target.insertMedia("image", url)}
          onAddVideoWidget={(url) => target.insertMedia("video", url)}
          // No onAddVoiceover: narration is written per scene (the
          // inspector) and music is ONE stock track (Media).
        />
      </AnonGateContext.Provider>
    ),
    layers: target.scene ? (
      <LayersPanel
        scene={target.scene}
        selectedWidgetId={target.selectedId}
        onSelectWidget={target.select}
        onReorderLayers={target.reorder}
        visibility={target.visibility}
      />
    ) : null,
  };
}
