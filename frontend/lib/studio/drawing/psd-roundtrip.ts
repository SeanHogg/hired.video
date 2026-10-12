/**
 * PSD round-trip for the image runtime (#940 Phase 2).
 *
 * Imports `ag-psd` to encode + decode Photoshop documents. The mapping
 * between `ImageState` and the PSD `Psd` shape is straight-forward:
 *
 *   ImageState.width/height ↔ Psd.width/height
 *   ImageState.background  ↔ painted into the bottom-most layer
 *   ImageState.layers[]    ↔ Psd.children[] (top-of-stack = last in ag-psd's
 *                            display order, opposite of our bottom-first layers)
 *
 * Raster layers serialise via their flattened `pixelsDataUrl` decoded
 * into a canvas. Vector + text layers rasterise on export (their content
 * has no PSD-native shape until ag-psd's vector / text writers ship —
 * tracked as a follow-on).
 *
 * Browser-only — depends on the `Image`/`HTMLCanvasElement` DOM APIs
 * for raster decoding.
 */

import { readPsd, writePsd, type Psd, type Layer } from "ag-psd";
import {
  IMAGE_STATE_SCHEMA_VERSION,
  type ImageLayer,
  type ImageState,
  makeVectorLayer as _makeVectorLayer,
} from "@shared/image-state";

/** Encode an ImageState into a PSD ArrayBuffer. Each layer's flattened
 *  pixels go to the corresponding PSD child layer; the project background
 *  paints onto the bottom-most layer's canvas before its pixels are
 *  serialised so the round-trip preserves the background colour.
 *
 *  Returns an ArrayBuffer; callers wrap it in a Blob with `image/vnd.adobe.photoshop`
 *  mime for download via the export-facade. */
export async function exportImageStateToPsd(state: ImageState): Promise<ArrayBuffer> {
  const psdChildren: Layer[] = [];
  for (const layer of state.layers) {
    const canvas = document.createElement("canvas");
    canvas.width = state.width;
    canvas.height = state.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("exportImageStateToPsd: no 2D context");
    if (layer.kind === "raster") {
      const src = layer.pixelsR2Key ?? layer.pixelsDataUrl;
      if (src) await drawSourceOnto(ctx, src);
    } else if (layer.kind === "vector") {
      const { hydrateVectorLayer } = await import("./drawing-engine");
      hydrateVectorLayer(canvas, (layer.vectorShapes ?? []) as Parameters<typeof hydrateVectorLayer>[1]);
    } else if (layer.kind === "text" && layer.textContent) {
      const { hydrateTextLayer } = await import("./drawing-engine");
      hydrateTextLayer(canvas, layer.textContent);
    }
    psdChildren.push({
      name: layer.label,
      opacity: layer.opacity,
      hidden: !layer.visible,
      blendMode: blendModeToPsd(layer.blendMode) as Layer["blendMode"],
      canvas,
    });
  }

  // Bottom-of-stack (index 0) gets the background paint baked beneath
  // its pixels so the PSD opens with the same surface the editor shows.
  if (psdChildren.length > 0 && state.background.kind === "color") {
    const first = psdChildren[0];
    if (first.canvas) {
      const ctx = first.canvas.getContext("2d");
      if (ctx) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = state.background.color;
        ctx.fillRect(0, 0, first.canvas.width, first.canvas.height);
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }

  const psd: Psd = {
    width: state.width,
    height: state.height,
    // ag-psd uses display-order children (top of stack = last in array
    // is what most Photoshop UIs show). Our layers[] is bottom-first
    // so the orders already align.
    children: psdChildren,
  };
  return writePsd(psd);
}

/** Decode a PSD ArrayBuffer into an ImageState. Each PSD child becomes
 *  a raster layer (vector / text smart objects rasterise — a Phase 2
 *  follow-on can detect and preserve them). The project background is
 *  the PSD's canvas background colour when present; otherwise white.
 *
 *  Returns a freshly-minted ImageState the caller swaps into the
 *  editor via `setImageState`. */
export async function importPsdToImageState(buffer: ArrayBuffer): Promise<ImageState> {
  const psd = readPsd(new Uint8Array(buffer), { skipLayerImageData: false });
  const width = psd.width;
  const height = psd.height;
  const layers: ImageLayer[] = [];
  const psdLayers = (psd.children ?? []).filter((c) => !("children" in c) || !c.children) as Layer[];
  for (let i = 0; i < psdLayers.length; i++) {
    const psdLayer = psdLayers[i];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx && psdLayer.canvas) {
      ctx.drawImage(psdLayer.canvas, psdLayer.left ?? 0, psdLayer.top ?? 0);
    }
    const dataUrl = canvas.toDataURL("image/png");
    layers.push({
      id: `layer-${Math.random().toString(36).slice(2, 10)}`,
      label: psdLayer.name ?? `Layer ${i + 1}`,
      kind: "raster",
      opacity: psdLayer.opacity ?? 1,
      visible: !psdLayer.hidden,
      locked: false,
      blendMode: psdToBlendMode(psdLayer.blendMode),
      pixelsDataUrl: dataUrl,
    });
  }
  // PSD storage order matches our bottom-first convention; no reverse
  // needed.
  if (layers.length === 0) {
    layers.push({
      id: `layer-${Math.random().toString(36).slice(2, 10)}`,
      label: "Background",
      kind: "raster",
      opacity: 1,
      visible: true,
      locked: false,
      blendMode: "normal",
      pixelsDataUrl: null,
    });
  }
  return {
    schemaVersion: IMAGE_STATE_SCHEMA_VERSION,
    width,
    height,
    background: { kind: "color", color: "#ffffff" },
    layers,
    activeLayerId: layers[layers.length - 1].id,
    aiPromptHistory: [],
  };
}

async function drawSourceOnto(
  ctx: CanvasRenderingContext2D,
  source: string,
): Promise<void> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("PSD export: failed to load layer source"));
    img.src = source;
  });
  ctx.drawImage(img, 0, 0);
}

/** Map our LayerBlendMode enum to ag-psd's blendMode string. Identity
 *  for the common modes; falls back to "normal" for anything ag-psd
 *  doesn't expose. */
function blendModeToPsd(mode: string): string {
  switch (mode) {
    case "normal": return "normal";
    case "multiply": return "multiply";
    case "screen": return "screen";
    case "overlay": return "overlay";
    case "darken": return "darken";
    case "lighten": return "lighten";
    case "color-dodge": return "color dodge";
    case "color-burn": return "color burn";
    case "soft-light": return "soft light";
    case "hard-light": return "hard light";
    case "difference": return "difference";
    case "exclusion": return "exclusion";
    default: return "normal";
  }
}

function psdToBlendMode(mode: string | undefined): ImageLayer["blendMode"] {
  switch (mode) {
    case "multiply": return "multiply";
    case "screen": return "screen";
    case "overlay": return "overlay";
    case "darken": return "darken";
    case "lighten": return "lighten";
    case "color dodge": return "color-dodge";
    case "color burn": return "color-burn";
    case "soft light": return "soft-light";
    case "hard light": return "hard-light";
    case "difference": return "difference";
    case "exclusion": return "exclusion";
    default: return "normal";
  }
}
