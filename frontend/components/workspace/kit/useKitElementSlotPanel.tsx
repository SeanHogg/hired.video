/**
 * The right slot's inspector for a free element selected on a kit's résumé
 * or letter page (Advanced): the studio's own widget properties
 * (FramePropertiesPanel → PropertiesPanel), editing the element through the
 * kit's document layers; ‹ back closes an open section, else lets go of
 * it. Null when nothing is selected on the page on screen.
 */
import { useTranslation } from "react-i18next";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import { PAGE_DIMENSIONS_PX } from "@/lib/studio/editor-v2/document-state";
import { KIT_PAGE_IDS, isKitDocPage, kitPageCanvas } from "@/lib/workspace/kit/kit-document";
import { kitPaper } from "@/lib/workspace/kit/kit-paper";
import FramePropertiesPanel, { type WidgetEditor } from "@/components/build/FramePropertiesPanel";
import { useSectionDrill } from "@/components/workspace/inspector/use-section-drill";
import { slotHeader } from "@/components/workspace/inspector/InspectorBody";
import type { SlotPanel } from "../RightSlot";

export function useKitElementSlotPanel(kit: KitWorkspace, advanced: boolean): SlotPanel | null {
  const { t } = useTranslation();
  const { nav, docLayers } = kit;
  const page = nav.page;
  const overlay = isKitDocPage(page) ? docLayers.selectedOn(page) : null;
  const drill = useSectionDrill(overlay?.widget.id ?? "", true);
  if (!advanced || !isKitDocPage(page) || !overlay) return null;

  const widgetId = overlay.widget.id;
  const paper = kitPaper(kit, page);
  const { width, height } = PAGE_DIMENSIONS_PX[paper];
  const label = t(page === "letter" ? "build.letter.pageLabel" : "build.resume.previewLabel");
  const canvas = kitPageCanvas(docLayers.state, page, { width, pageHeight: height, pageCount: docLayers.pageCounts[page], label });
  const editor: WidgetEditor = {
    selection: { kind: "widget", sceneId: KIT_PAGE_IDS[page], widgetId },
    patchWidget: (id, patch) => docLayers.patch(page, id, patch),
    remove: (id) => docLayers.remove(page, id),
  };
  const deselect = () => docLayers.select(page, null);
  const kicker = t(page === "letter" ? "workspace.slot.theLetter" : "workspace.slot.thisResume");

  const title = t("workspace.slot.element");

  return {
    ...(drill.labelKey
      ? slotHeader({ kicker, title, drillTitle: t(drill.labelKey), onBack: drill.back })
      : { kicker, title, onBack: deselect }),
    content: (
      <div className="flex flex-col gap-4 p-4">
        <FramePropertiesPanel key={widgetId} canvas={canvas} frame={editor} drill={drill} />
      </div>
    ),
  };
}
