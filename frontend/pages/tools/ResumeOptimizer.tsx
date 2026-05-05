import { Zap } from "lucide-react";
import { ResumeAnalysisToolPage } from "@/components/tools/ResumeAnalysisToolPage";

// Optimizer surface — same engine as the AI Resume Scorer (one
// `analyzeResume` LLM call, one `ResumeAnalysisSchema`); the route
// stays separate for SEO + tool-run history. The shell self-gates on
// what's in the response — Optimizer leads with the optimized rewrite,
// the recommendations panel exposes Take-Action buttons that route
// through the registry's wand tools (consolidate / standardize /
// shorten / etc.).
export default function ResumeOptimizer() {
  return (
    <ResumeAnalysisToolPage
      toolId="resume-optimizer"
      header={{
        icon: <Zap className="h-6 w-6 text-brand-blue" />,
        iconBgClassName: "bg-brand-blue/10",
        title: "Resume Optimizer",
        description: "Optimize your resume for ATS systems and improve your job search success",
      }}
      submit={{
        label: "Optimize Resume",
        loadingLabel: "Optimizing...",
        icon: Zap,
      }}
      endpoint="/api/ResumeOptimizer/optimize"
      showJobDescription
      reportLabel="Resume Optimization Report"
      emptyState={{
        title: "Ready to Optimize",
        blurb:
          "Upload a resume file, paste text, or select from your saved resumes to get optimization suggestions.",
        bullets: [
          "ATS compatibility analysis",
          "Keyword optimization suggestions",
          "Format improvement recommendations",
          "Content quality assessment",
          "Actionable improvement tips",
        ],
      }}
    />
  );
}
