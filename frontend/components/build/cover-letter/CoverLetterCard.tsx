/**
 * The cover letter's line in the kit chat, under a job review: writing →
 * ready ("View letter") → or, on a free plan, the Pro prompt. Self-gating:
 * renders nothing until the review has asked for a letter.
 */
import { useTranslation } from "react-i18next";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CoverLetterDraft } from "@/lib/build/review/use-cover-letter-writer";
import CoverLetterUpgradeButton from "./CoverLetterUpgradeButton";

export default function CoverLetterCard({ draft, onView }: { draft: CoverLetterDraft | undefined; onView: () => void }) {
  const { t } = useTranslation();
  if (!draft || draft.status === "idle") return null;
  const org = draft.letter?.organization;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-[14px] leading-[1.5] text-foreground">
      <p className="flex items-center gap-2 font-semibold">
        <FileText aria-hidden="true" className="h-4 w-4 text-primary" />
        {t("build.letter.title")}
      </p>
      {draft.status === "writing" && (
        <p aria-live="polite" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {t("build.letter.writing")}
        </p>
      )}
      {draft.status === "ready" && (
        <>
          <p aria-live="polite">{org ? t("build.letter.readyFor", { organization: org }) : t("build.letter.ready")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="min-h-11 sm:min-h-9" onClick={onView}>
              {t("build.letter.view")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={draft.rewrite}>
              {t("build.letter.rewrite")}
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("build.letter.savedWith")}</p>
        </>
      )}
      {draft.status === "locked" && (
        <>
          <p className="text-muted-foreground">{t("build.letter.locked")}</p>
          <div>
            <CoverLetterUpgradeButton />
          </div>
        </>
      )}
      {draft.status === "error" && (
        <>
          <p role="alert" className="text-muted-foreground">
            {t(draft.errorKey ?? "review.error.generic")}
          </p>
          <div>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={draft.rewrite}>
              {t("build.letter.tryAgain")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
