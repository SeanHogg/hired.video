import { Brain, Star } from "lucide-react";
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
  return (
    <ResumeAnalysisToolPage
      toolId="ai-resume-scorer"
      header={{
        icon: <Brain className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-brand-purple/10",
        title: "AI Resume Scorer",
        description: "Get instant AI-powered feedback and scoring for your resume",
        titleExtras: (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Hot
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
                <h3 className="font-semibold text-purple-900 mb-1">How it works</h3>
                <p className="text-sm text-purple-800">
                  Our AI analyzes your resume across multiple dimensions including ATS
                  compatibility, content quality, keyword optimization, and formatting to
                  provide a comprehensive score and actionable feedback.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      }
      submit={{
        label: "Score My Resume",
        loadingLabel: "Scoring Resume...",
        icon: Brain,
      }}
      endpoint="/api/ResumeScorer/score"
      reportLabel="Resume Score Report"
      emptyState={{
        title: "Ready to Score",
        blurb:
          "Upload a resume file, paste text, or select from your saved resumes to get instant AI-powered scoring.",
        bullets: [
          "Overall resume score and letter grade",
          "ATS compatibility analysis",
          "Content quality assessment",
          "Keyword optimization score",
          "Format and impact evaluation",
          "Personalized improvement recommendations",
        ],
      }}
    />
  );
}
