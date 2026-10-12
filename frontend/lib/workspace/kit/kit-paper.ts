/**
 * The paper a kit's document page sits on, read from the kit: the résumé on
 * its design's page (resume-style.ts — Letter or A4), the letter on its own
 * style's paper. The ONE place the kit's surfaces (page, preview, strip,
 * element inspector, print overlays) ask.
 */
import type { PageSize } from "@/lib/studio/editor-v2/document-state";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import { resumePaper } from "@/lib/build/resume-style";
import { kitDocPaper, type KitDocPage } from "./kit-document";

export function kitPaper(kit: Pick<KitWorkspace, "picks" | "letter">, page: KitDocPage): PageSize {
  return kitDocPaper(page, kit.letter?.letter?.style?.paper, resumePaper(kit.picks.descriptor));
}
