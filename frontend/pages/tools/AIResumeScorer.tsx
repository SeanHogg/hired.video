import { Brain, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ResumeAnalysisToolPage } from "@/components/tools/ResumeAnalysisToolPage";

// Scorer surface — same engine as the Resume Optimizer (one
// `analyzeResume` LLM call); route is kept separate for SEO + tool-run
// history. The shell self-gates on what's present in the response —
// Scorer leads with the grade chip + strengths/weaknesses; the
// recommendations panel renders the same Take-Action buttons as the
// Optimizer (registry-backed wands).
export default function AIResumeScorer() {
  const { t } = useTranslation();
  return (
    <ResumeAnalysisToolPage
      toolId="ai-resume-scorer"
      header={{
        icon: <Brain className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-brand-purple/10",
        title: t("tools.aiResumeScorer.title"),
        description: t("tools.aiResumeScorer.subtitle"),
        titleExtras: (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            {t("tools.badge.hot")}
          </Badge>
        ),
      }}
      infoCard={
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <Star className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-900 mb-1">
                  {t("tools.aiResumeScorer.howItWorksTitle")}
                </h3>
                <p className="text-sm text-purple-800">
                  {t("tools.aiResumeScorer.howItWorksBody")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      }
      submit={{
        label: t("tools.aiResumeScorer.submitLabel"),
        loadingLabel: t("tools.aiResumeScorer.submitLoading"),
        icon: Brain,
      }}
      endpoint="/api/ResumeScorer/score"
      reportLabel={t("tools.aiResumeScorer.reportHeader")}
      emptyState={{
        title: t("tools.aiResumeScorer.emptyTitle"),
        blurb: t("tools.aiResumeScorer.emptyBlurb"),
        bullets: [
          t("tools.aiResumeScorer.feature1"),
          t("tools.aiResumeScorer.feature2"),
          t("tools.aiResumeScorer.feature3"),
          t("tools.aiResumeScorer.feature4"),
          t("tools.aiResumeScorer.feature5"),
          t("tools.aiResumeScorer.feature6"),
        ],
      }}
    />
  );
}
