/**
 * /tools/xyz-resume-review — "Review my whole résumé in XYZ" (#990). On
 * the kit workspace it opens in the stage slide-out bound to the open draft (ToolShell
 * embedded + useToolEntityParams), so the pass lands on the page as ONE
 * Undo step; on its own page the visitor picks one of their résumés first.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import ResumeSelectItem, { type ResumeRow } from "@/components/tools/ResumeSelectItem";
import XyzReviewAllWizard from "@/components/build/xyz/XyzReviewAllWizard";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { useUserResumes } from "@/hooks/queries/use-resumes";

export default function XyzResumeReview() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { resumeId: boundResumeId } = useToolEntityParams();
  const [picked, setPicked] = useState(boundResumeId ?? "");
  const resumeId = boundResumeId ?? (picked || null);

  const { data: resumes } = useUserResumes({ enabled: !boundResumeId });

  return (
    <ToolShell
      toolId="xyz-resume-review"
      header={{
        icon: <Sparkles className="h-6 w-6" />,
        title: t("tools.card.xyz-resume-review.title"),
        description: t("tools.card.xyz-resume-review.description"),
      }}
      authOverlay={{ show: !isAuthenticated, message: t("build.xyz.signIn") }}
    >
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {!boundResumeId && (
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger aria-label={t("labels.selectResume")}>
              <SelectValue placeholder={t("fields.interviewQuestions.chooseResume")} />
            </SelectTrigger>
            <SelectContent>
              {(resumes ?? [])
                .filter((r): r is typeof r & { id: string } => typeof r.id === "string")
                .map((r) => (
                  <ResumeSelectItem key={r.id} resume={{ id: r.id, title: r.title ?? null, slug: r.slug ?? null } satisfies ResumeRow} />
                ))}
            </SelectContent>
          </Select>
        )}
        {resumeId && <XyzReviewAllWizard key={resumeId} resumeId={resumeId} />}
      </div>
    </ToolShell>
  );
}
