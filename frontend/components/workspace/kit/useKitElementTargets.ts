/**
 * The KitElementTarget adapters useKitElementTools renders over:
 *
 *   video      the frame editor, the selected scene's elements
 *   documents  the résumé / letter page's free elements (useKitDocumentLayers)
 *              — restack, select, hide, lock
 *
 * Null where the open page has nothing to add to (another page, the kit or
 * its project still loading, no letter yet).
 */
import { useTranslation } from "react-i18next";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import { isKitDocPage, kitPageOverlays, kitPageScene } from "@/lib/workspace/kit/kit-document";
import { canvasSceneId } from "@/lib/build/scene-voiceover";
import { useGatedScreenshot } from "@/lib/build/use-gated-screenshot";
import type { KitElementTarget } from "./useKitElementTools";

export function useKitVideoElementTarget(kit: KitWorkspace): KitElementTarget | null {
  const { ready, nav, video, editor } = kit;
  if (!ready || nav.page !== "video") return null;
  const frame = editor.frame;
  const activeSceneId = canvasSceneId(video.selected);
  const scene = ready.canvas.scenes.find((s) => s.id === activeSceneId) ?? null;
  return {
    mediaKind: "video",
    activeSceneId,
    scene,
    selectedId: frame.selection.kind === "widget" ? frame.selection.widgetId : null,
    uploadGate: frame.uploadGate,
    insert: (kind) => frame.insert(kind),
    insertLinked: (kind, id) => frame.insertLinked(kind, id),
    insertMedia: (kind, url) => frame.insertMedia(kind, url),
    captureScreenshot: () => frame.captureScreenshot(),
    reorder: (ids) => {
      if (scene) frame.reorder(scene.id, ids);
    },
    select: (widgetId) => frame.select({ kind: "widget", sceneId: activeSceneId, widgetId }),
  };
}

export function useKitDocumentElementTarget(kit: KitWorkspace): KitElementTarget | null {
  const { t } = useTranslation();
  const { ready, nav, docLayers, editor } = kit;
  const uploadGate = editor.frame.uploadGate;
  const gatedScreenshot = useGatedScreenshot(uploadGate);
  const page = nav.page;
  if (!ready || !isKitDocPage(page) || !docLayers.ready) return null;
  if (page === "letter" && !kit.letter?.letter) return null;

  const overlays = kitPageOverlays(docLayers.state, page);
  const scene = kitPageScene(docLayers.state, page, {
    pageCount: docLayers.pageCounts[page],
    label: t(page === "letter" ? "build.letter.pageLabel" : "build.resume.previewLabel"),
    includeHidden: true,
  });
  return {
    mediaKind: "document",
    activeSceneId: scene.id,
    scene,
    selectedId: docLayers.selectedOn(page)?.widget.id ?? null,
    uploadGate,
    insert: (kind) => docLayers.insert(page, kind),
    insertLinked: (kind, id) => docLayers.insertLinked(page, kind, id),
    insertMedia: (kind, url) => docLayers.insertMedia(page, kind, url),
    captureScreenshot: () => gatedScreenshot((url) => docLayers.insertMedia(page, "image", url)),
    reorder: (ids) => docLayers.reorder(page, ids),
    select: (id) => docLayers.select(page, id),
    visibility: {
      hiddenIds: new Set(overlays.filter((o) => o.hidden).map((o) => o.widget.id)),
      lockedIds: new Set(overlays.filter((o) => o.locked).map((o) => o.widget.id)),
      onToggleHidden: (id) => docLayers.toggle(page, id, "hidden"),
      onToggleLocked: (id) => docLayers.toggle(page, id, "locked"),
    },
  };
}
