/**
 * "Tailor my résumé to this job" — the step after a job-match result: opens
 * the tailor review for that résumé + job. Embedded in the kit workspace (tool-embed.tsx)
 * it opens right on the page; on the tool's own page it goes to the kit workspace.
 * Renders nothing without a résumé and a job to tailor to.
 */
import { useTranslation } from "react-i18next";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenReview } from "@/lib/tools/use-open-review";

const LABEL_MAX = 80;

interface TailorToJobButtonProps {
  resumeId: string | undefined;
  job: { jobId?: string; jobContent?: string };
  className?: string;
}

export default function TailorToJobButton({ resumeId, job, className }: TailorToJobButtonProps) {
  const { t } = useTranslation();
  const openReview = useOpenReview();
  const jobHtml = job.jobContent?.trim();
  if (!resumeId || (!job.jobId && !jobHtml)) return null;

  const label = jobHtml?.split("\n")[0].slice(0, LABEL_MAX) || t("toolSteps.match.thisJob");
  const tailor = () =>
    openReview(resumeId, {
      kind: "job",
      create: false,
      job: job.jobId ? { jobId: job.jobId, label } : { jobHtml, label },
    });

  return (
    <Button onClick={tailor} className={className}>
      <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
      {t("toolSteps.match.tailorToJob")}
    </Button>
  );
}
