/**
 * The kit's Letter tab: the cover letter page with its own bar — Copy text,
 * Word, PDF, and (while its job review is open) Rewrite. Writing / locked /
 * failed states sit on the same paper so the tab never jumps.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, FileDown, Loader2, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CoverLetterView } from "@/lib/build/use-cover-letter-view";
import { copyCoverLetter, downloadCoverLetterWord, formatLetterDate, printCoverLetter } from "@/lib/cover-letter-export";
import CoverLetterPage from "./CoverLetterPage";
import CoverLetterUpgradeButton from "./CoverLetterUpgradeButton";

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[8.5/11] w-full max-w-[880px] flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-input p-6 text-center text-[15px] text-muted-foreground">
      {children}
    </div>
  );
}

const ACTION = "min-h-11 gap-1.5 sm:min-h-9";

interface CoverLetterPaneProps {
  view: CoverLetterView;
  zoom?: number;
  /** Puts the page somewhere else (the kit's document stage): gets the bare
   *  page, returns what renders in its place; the action bar stays above. */
  renderPage?: (page: ReactNode) => ReactNode;
  /** The page's free elements for Word / PDF (one PNG per page). */
  overlays?: () => Promise<Array<string | null>>;
}

export default function CoverLetterPane({ view, zoom, renderPage, overlays }: CoverLetterPaneProps) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { letter, content, status } = view;

  if (!letter) {
    if (status === "writing") {
      return (
        <Placeholder>
          <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-primary" />
          <p aria-live="polite">{t("build.letter.writing")}</p>
        </Placeholder>
      );
    }
    if (status === "locked") {
      return (
        <Placeholder>
          <p>{t("build.letter.locked")}</p>
          <CoverLetterUpgradeButton size="default" />
        </Placeholder>
      );
    }
    return (
      <Placeholder>
        <p role="alert">{t("build.letter.failed")}</p>
        {view.rewrite && (
          <Button type="button" variant="outline" className="min-h-11" onClick={view.rewrite}>
            {t("build.letter.tryAgain")}
          </Button>
        )}
      </Placeholder>
    );
  }

  const date = formatLetterDate(letter.date, i18n.language);
  // A download carries the free elements when there are any; a failed
  // rasterize never blocks the letter itself.
  const withOverlays = async (run: (o?: Array<string | null>) => void) => run(overlays ? await overlays().catch(() => undefined) : undefined);
  const copy = async () => {
    try {
      await copyCoverLetter(letter, content, date);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label={t("build.letter.actions")} className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className={ACTION} onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          {t(copied ? "build.letter.copied" : "build.letter.copy")}
        </Button>
        <Button type="button" size="sm" variant="outline" className={ACTION} onClick={() => void withOverlays((o) => downloadCoverLetterWord(letter, content, date, o))}>
          <FileDown aria-hidden="true" className="h-4 w-4" />
          {t("build.letter.word")}
        </Button>
        <Button type="button" size="sm" variant="outline" className={ACTION} onClick={() => void withOverlays((o) => printCoverLetter(letter, content, date, o))}>
          <Printer aria-hidden="true" className="h-4 w-4" />
          {t("build.letter.pdf")}
        </Button>
        {view.rewrite && (
          <Button type="button" size="sm" variant="ghost" className={ACTION} disabled={status === "writing"} onClick={view.rewrite}>
            {status === "writing" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            )}
            {t("build.letter.rewrite")}
          </Button>
        )}
      </div>
      {renderPage ? (
        renderPage(<CoverLetterPage letter={letter} content={content} onChange={view.onChange} bare />)
      ) : (
        <CoverLetterPage letter={letter} content={content} onChange={view.onChange} zoom={zoom} />
      )}
    </div>
  );
}
