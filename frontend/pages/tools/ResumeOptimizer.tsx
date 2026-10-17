import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ResumeAnalysisToolPage } from "@/components/tools/ResumeAnalysisToolPage";

// Optimizer surface — same engine as the AI Resume Scorer (one
// `analyzeResume` LLM call, one `ResumeAnalysisSchema`); the route
// stays separate for SEO + tool-run history. The shell self-gates on
// what's in the response — Optimizer leads with the optimized rewrite,
// the recommendations panel exposes Take-Action buttons that route
// through the registry's wand tools (consolidate / standardize /
// shorten / etc.).
export default function ResumeOptimizer() {
  const { t } = useTranslation();
  return (
    <ResumeAnalysisToolPage
      toolId="resume-optimizer"
      header={{
        icon: <Zap className="h-6 w-6" />,
        title: t("tools.resumeOptimizer.title"),
        description: t("tools.resumeOptimizer.subtitle"),
      }}
      submit={{
        label: t("tools.resumeOptimizer.submitLabel"),
        loadingLabel: t("tools.resumeOptimizer.submitLoading"),
        icon: Zap,
      }}
      endpoint="/api/resumeoptimizer/optimize"
      showJobDescription
      reportLabel={t("tools.resumeOptimizer.reportLabel")}
      emptyState={{
        title: t("tools.resumeOptimizer.emptyTitle"),
        blurb: t("tools.resumeOptimizer.emptyBlurb"),
        bullets: [
          t("tools.resumeOptimizer.feature1"),
          t("tools.resumeOptimizer.feature2"),
          t("tools.resumeOptimizer.feature3"),
          t("tools.resumeOptimizer.feature4"),
          t("tools.resumeOptimizer.feature5"),
        ],
      }}
    />
  );
}
