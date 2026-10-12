/**
 * KitCanvas — what a career kit shows on the canvas, by page (the stepper
 * picks it; kit-stages.ts):
 *
 *   no résumé yet   the drop zone (photo · résumé · letter · job, or
 *                   describe yourself), then the parse's live progress
 *   résumé          the page with its review layer, section pencils and
 *                   pinned findings, on the document stage with its free
 *                   elements; a click on a line selects it (KitResumePage)
 *   letter          the cover letter on its own paper with its free
 *                   elements (KitLetterPage), or — none yet — what makes
 *                   one (aim it at a job)
 *   video           the frame (the studio's CanvasStage: click to select,
 *                   drag, retype on the frame), in the video's shape. The
 *                   clipboard lives in the strip (useStripClipboard), and
 *                   answers its keys from the frame too.
 *
 * A click on any page reopens the right slot's inspector. The stepper is the
 * only page navigation (A2 review #7) — there is no second page switch.
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { BuildEntryState } from "@/lib/build-entry";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { KitPlayback } from "@/lib/workspace/use-kit-playback";
import KitResumePage from "./KitResumePage";
import KitLetterPage from "./KitLetterPage";
import FrameStage from "@/components/build/FrameStage";
import ParseProgress from "@/components/build/ParseProgress";
import type { VideoAspect } from "@shared/video-targeting";
import KitDropZone from "./KitDropZone";

interface KitCanvasProps {
  kit: KitWorkspace;
  clock: KitPlayback;
  /** A click on the page: show the inspector for what is selected. */
  onCanvasClick: () => void;
  advanced: boolean;
}

const PAGE = "mx-auto flex w-full max-w-[880px] flex-col gap-3 px-4 py-6 sm:px-6";

/** The frame per shape: its ratio (w / h) and the widest it gets (px). It
 *  fills the room the frame leaves (a size container) at its shape, so a
 *  tall 9:16 or a square fits a 360×640 phone without scrolling. The canvas
 *  renders at the shape's native size inside it. */
const FRAME: Record<VideoAspect, { ratio: number; css: string; maxPx: number }> = {
  "16:9": { ratio: 16 / 9, css: "16 / 9", maxPx: 960 },
  "9:16": { ratio: 9 / 16, css: "9 / 16", maxPx: 428 },
  "1:1": { ratio: 1, css: "1 / 1", maxPx: 640 },
};

function frameStyle(aspect: VideoAspect): CSSProperties {
  const { ratio, css, maxPx } = FRAME[aspect];
  return { width: `min(100cqw, calc(100cqh * ${ratio}), ${maxPx}px)`, aspectRatio: css };
}

export default function KitCanvas({ kit, clock, onCanvasClick, advanced }: KitCanvasProps) {
  const { t } = useTranslation();
  const { ready, intake, entry, nav, zoom, letter, editor, journey, video } = kit;

  if (!ready) {
    const parsing = intake.status === "parsing" || entry.status === "loading";
    if (parsing) {
      return (
        <div className={PAGE}>
          <div className="flex aspect-[8.5/11] w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-input p-6 text-center text-[15px] text-muted-foreground">
            <ParseProgress progress={intake.progress} />
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-8 sm:px-6">
        <KitDropZone
          onStart={(state: BuildEntryState) => entry.start(state)}
          lead={entry.focus}
          heading={
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("workspace.drop.heading")}</h1>
              <p className="text-sm text-muted-foreground">{t("workspace.drop.sub")}</p>
            </div>
          }
        />
      </div>
    );
  }

  if (nav.page === "letter") {
    return (
      <div className={PAGE} data-page="letter" onClickCapture={onCanvasClick}>
        {letter ? (
          <KitLetterPage view={letter} layers={kit.docLayers} zoom={zoom.zoom} advanced={advanced} projectId={kit.projectId} />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card p-5">
            <p className="text-sm text-foreground">{t("workspace.letter.none")}</p>
            <button
              type="button"
              onClick={() => journey.openTool("resume-tailor")}
              className="min-h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:min-h-9"
            >
              {t("workspace.letter.makeOne")}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (nav.page === "video") {
    return (
      <div className="mx-auto flex h-full w-full max-w-[960px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-6" data-page="video">
        {/* The room the frame may fill (a size container for its cq units). */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center" style={{ containerType: "size" }}>
          <div
            className="relative overflow-hidden rounded-[18px] bg-black"
            style={frameStyle(video.plan.aspect ?? "16:9")}
            onClickCapture={onCanvasClick}
          >
            <FrameStage canvas={ready.canvas} playback={clock.playback} frame={editor.frame} />
          </div>
        </div>
        <p className="flex-none text-sm text-muted-foreground">{t("build.frame.helper")}</p>
      </div>
    );
  }

  return (
    <div className={PAGE} data-page="resume" onClickCapture={onCanvasClick}>
      <KitResumePage kit={kit} advanced={advanced} />
    </div>
  );
}
