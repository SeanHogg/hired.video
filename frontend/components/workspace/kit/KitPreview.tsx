/**
 * Header › Preview on a career kit: the open page as others will see it —
 * the video full screen in the studio's own PreviewOverlay (same clock as
 * the strip), or the résumé / letter full screen on their paper, with their
 * free elements and no editing chrome.
 * Escape or ✕ closes.
 */
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { KitPlayback } from "@/lib/workspace/use-kit-playback";
import PreviewOverlay from "@/components/studio/v2/PreviewOverlay";
import ResumePreviewPane from "@/components/build/ResumePreviewPane";
import KitLetterPage from "./KitLetterPage";
import KitDocumentStage from "./KitDocumentStage";
import { kitPaper } from "@/lib/workspace/kit/kit-paper";
import { useEscape } from "@/hooks/use-escape";

export default function KitPreview({ kit, clock, onClose }: { kit: KitWorkspace; clock: KitPlayback; onClose: () => void }) {
  const { t } = useTranslation();
  const { ready, nav, picks, letter } = kit;
  const isVideo = nav.page === "video";

  // The video's PreviewOverlay handles its own Escape.
  useEscape(!isVideo, onClose);

  if (!ready) return null;
  if (isVideo) return <PreviewOverlay state={ready.canvas} playback={clock.playback} onClose={onClose} />;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("actions.preview")} className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("actions.close")}
        className="fixed right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="mx-auto w-full max-w-[920px] px-4 py-12">
        {nav.page === "letter" && letter ? (
          <KitLetterPage view={{ ...letter, onChange: undefined, rewrite: undefined }} layers={kit.docLayers} zoom={1} advanced={false} />
        ) : (
          <KitDocumentStage page="resume" layers={kit.docLayers} paper={kitPaper(kit, "resume")} zoom={1} advanced={false}>
            <div className="p-12">
              <ResumePreviewPane resume={ready.resume} descriptor={picks.descriptor} bare />
            </div>
          </KitDocumentStage>
        )}
      </div>
    </div>
  );
}
