/**
 * Layer R2 spill helper (#940 Phase 2 — brush dataURL bloat mitigation).
 *
 * When a raster layer's flattened PNG dataURL exceeds
 * `LAYER_DATAURL_SPILL_BYTES`, persisting the layer inline in the JSONB
 * row bloats `studio_projects.image_state` to the point where autosaves
 * stutter + the row's max size becomes a real concern. This helper
 * detects the case + uploads the pixels to R2 instead, replacing the
 * inline dataURL with an `r2Key` pointer.
 *
 * Per the DRY rule the spill threshold lives ONCE in
 * `shared/image-state.ts` (`LAYER_DATAURL_SPILL_BYTES`); the upload
 * leg goes through the standard uploadImage service so R2 keys live
 * under the same `uploads/<userId>/images/` prefix as user-pasted
 * images.
 *
 * Invariants:
 *   - When `pixelsR2Key` is set, `pixelsDataUrl` is cleared so the
 *     row stays small.
 *   - The hydrator (DrawingStage) prefers the R2 URL when present;
 *     when R2 fetch fails, it falls back to the dataURL (which is
 *     null after spill — the layer renders empty until reload).
 */

import type { ImageLayer } from "@shared/image-state";
import { LAYER_DATAURL_SPILL_BYTES } from "@shared/image-state";
import { uploadImage } from "@/lib/services/upload-service";

/** Return true when the layer's dataURL is over the spill threshold
 *  and should be promoted to R2. dataURL is base64 with a `data:` prefix;
 *  the raw byte count is ~length * 3/4 minus the prefix. */
export function shouldSpillLayer(layer: ImageLayer): boolean {
  if (layer.kind !== "raster") return false;
  if (!layer.pixelsDataUrl) return false;
  if (layer.pixelsR2Key) return false;
  const commaIdx = layer.pixelsDataUrl.indexOf(",");
  const b64Length = commaIdx >= 0 ? layer.pixelsDataUrl.length - commaIdx - 1 : layer.pixelsDataUrl.length;
  const approxBytes = Math.floor(b64Length * 3 / 4);
  return approxBytes > LAYER_DATAURL_SPILL_BYTES;
}

/** Upload a layer's pixels to R2 + return a new layer with the
 *  `pixelsR2Key` pointer set + `pixelsDataUrl` cleared. No-op when
 *  the layer doesn't need spilling. */
export async function spillLayerToR2(layer: ImageLayer): Promise<ImageLayer> {
  if (!shouldSpillLayer(layer) || !layer.pixelsDataUrl) return layer;
  // Decode dataURL → Blob → File. uploadImage takes a File and routes
  // through the standard validation + upload service.
  const blob = await (await fetch(layer.pixelsDataUrl)).blob();
  const file = new File([blob], `${layer.id}.png`, { type: "image/png" });
  let url: string;
  try {
    url = await uploadImage(file, `${layer.id}.png`);
  } catch {
    // Spill failed — return the layer untouched so the caller can
    // retry / fall back to inline persistence.
    return layer;
  }
  if (!url) return layer;
  return {
    ...layer,
    pixelsDataUrl: null,
    pixelsR2Key: url,
  };
}

/** Walk every layer in a state's layers array and spill any that
 *  qualify. Returns the new layers array (or the original if no
 *  layer needed spilling). Callers wrap autosave / save-draft. */
export async function spillLayersIfNeeded(
  layers: ReadonlyArray<ImageLayer>,
): Promise<ImageLayer[]> {
  const spilled: ImageLayer[] = [];
  let mutated = false;
  for (const layer of layers) {
    if (shouldSpillLayer(layer)) {
      const next = await spillLayerToR2(layer);
      spilled.push(next);
      if (next !== layer) mutated = true;
    } else {
      spilled.push(layer);
    }
  }
  return mutated ? spilled : [...layers];
}
