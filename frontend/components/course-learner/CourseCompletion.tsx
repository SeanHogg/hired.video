// Course-completion surfaces for /learn/:enrollmentId.
//
// CourseCompletePanel — persistent "Course complete" card shown whenever the
// enrollment is passed, regardless of which lesson is selected, so returning
// learners always have a completion + certificate affordance. Self-gates on
// `passed`, so the page leaves it mounted unconditionally.
//
// CourseCompletionDialog — one-shot celebration fired when the enrollment
// flips false → true in-session.

import { Award } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function CompletionMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={
        size === "lg"
          ? "mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green/15 text-brand-green-text"
          : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green/15 text-brand-green-text"
      }
    >
      <Award className={size === "lg" ? "h-7 w-7" : "h-6 w-6"} aria-hidden="true" />
    </span>
  );
}

export function CourseCompletePanel({
  passed,
  courseTitle,
  issuesCertificate,
  certNumber,
}: {
  passed: boolean;
  courseTitle: string;
  issuesCertificate: boolean;
  certNumber: string | null;
}) {
  const { t } = useTranslation();
  if (!passed) return null;
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[20px] border border-brand-green/40 bg-brand-green/10 p-5">
      <CompletionMark />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{t("headings.courseLearner.courseComplete")}</p>
        <p className="text-sm text-muted-foreground">
          {issuesCertificate
            ? t("messages.courseLearner.completePanelWithCert", { courseTitle })
            : t("messages.courseLearner.completePanel", { courseTitle })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {certNumber && (
          <Button asChild className="min-h-[44px]">
            <a href={`/verify/${certNumber}`} target="_blank" rel="noreferrer">
              <Award className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("actions.courseLearner.viewCertificate")}
            </a>
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-[44px]">
          <a href="/tools?tab=learning">{t("actions.courseLearner.browseMoreCourses")}</a>
        </Button>
      </div>
    </section>
  );
}

export function CourseCompletionDialog({
  open,
  onOpenChange,
  courseTitle,
  certNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseTitle: string;
  certNumber: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <CompletionMark size="lg" />
          <DialogTitle className="text-center font-display text-2xl tracking-tight">
            {t("headings.courseLearner.courseCompleteBang")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("messages.courseLearner.dialogFinishedPrefix")}{" "}
            <span className="font-medium text-foreground">{courseTitle}</span>.{" "}
            {t("messages.courseLearner.dialogFinishedSuffix")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-col sm:justify-center sm:gap-2">
          {certNumber && (
            <Button asChild className="min-h-[44px] w-full sm:w-auto">
              <a href={`/verify/${certNumber}`} target="_blank" rel="noreferrer">
                <Award className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("actions.courseLearner.viewYourCertificate")}
              </a>
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-[44px] w-full sm:w-auto">
            <a href="/tools?tab=learning">{t("actions.courseLearner.browseMoreCourses")}</a>
          </Button>
          <Button variant="ghost" className="min-h-[44px] w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t("actions.courseLearner.keepReviewing")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
