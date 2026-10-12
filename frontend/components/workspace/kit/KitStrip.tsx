/**
 * KitStrip — a career kit's 150px strip, by page:
 *
 *   video     the timeline (strip/VideoStrip): Simple = scene row + Voice
 *             and Music rows; Advanced appends the Text and Captions tracks
 *             and the clipboard · Layers · zoom tools.
 *   résumé /  the document's own pages ("Résumé pages" / "Letter pages",
 *   letter    as the stage counted them) + zoom.
 *   intake    a skeleton of the same height (the frame never jumps).
 *
 * Every timeline edit lands in the kit's one history (the frame editor /
 * the plan), so Undo, autosave and Post cover it.
 */
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { KitPlayback } from "@/lib/workspace/use-kit-playback";
import { KIT_PAGES_TITLE_KEY, isKitDocPage } from "@/lib/workspace/kit/kit-document";
import { kitPaper } from "@/lib/workspace/kit/kit-paper";
import WorkspaceStrip, { WorkspaceStripSkeleton } from "../WorkspaceStrip";
import DocumentPages from "./DocumentPages";
import VideoStrip from "./strip/VideoStrip";

interface KitStripProps {
  kit: KitWorkspace;
  clock: KitPlayback;
  advanced: boolean;
}

const ICON = "flex h-11 w-11 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40";

export default function KitStrip({ kit, clock, advanced }: KitStripProps) {
  const { t } = useTranslation();
  const { ready, nav, zoom, docLayers } = kit;
  // Intake: hold the strip's place so the canvas never jumps.
  if (!ready) return <WorkspaceStripSkeleton />;

  const page = nav.page;
  if (!isKitDocPage(page)) return <VideoStrip kit={kit} ready={ready} clock={clock} advanced={advanced} />;

  const title = t(KIT_PAGES_TITLE_KEY[page]);
  return (
    <WorkspaceStrip
      label={title}
      ariaLabel={title}
      controls={
        <div className="flex items-center gap-1" role="group" aria-label={t("build.canvas.label")}>
          <button type="button" onClick={zoom.zoomOut} disabled={!zoom.canZoomOut} aria-label={t("build.canvas.zoomOut")} className={ICON}>
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span aria-live="polite" className="w-11 text-center text-xs tabular-nums text-foreground">
            {Math.round(zoom.zoom * 100)}%
          </span>
          <button type="button" onClick={zoom.zoomIn} disabled={!zoom.canZoomIn} aria-label={t("build.canvas.zoomIn")} className={ICON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={zoom.fit} className="min-h-11 min-w-11 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted">
            {t("build.canvas.fit")}
          </button>
        </div>
      }
    >
      <DocumentPages page={page} pages={docLayers.pageCounts[page]} paper={kitPaper(kit, page)} />
    </WorkspaceStrip>
  );
}
