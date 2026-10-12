/**
 * Every AI Tool's page component, keyed by its TOOLS_CATALOG id — the ONE
 * place a tool id maps to the component that runs it. App.tsx routes
 * `/tools/<slug>` to these; the kit workspace opens the same component in a slide-out
 * over the open résumé (ToolPanelSheet + tool-embed.tsx). Lazy, so naming a
 * tool here costs nothing until it is opened.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export const TOOL_PAGES = {
  "ai-resume-scorer": lazy(() => import("@/pages/tools/AIResumeScorer")),
  "career-360": lazy(() => import("@/pages/tools/Career360")),
  "comp-analyzer": lazy(() => import("@/pages/tools/CompAnalyzer")),
  "employer-research": lazy(() => import("@/pages/tools/EmployerResearch")),
  "form-autofill": lazy(() => import("@/pages/tools/FormAutofill")),
  // Shell-free: /interview wraps it in its own page chrome + landing.
  "interview-coach": lazy(() => import("@/components/interview-practice/InterviewCoach")),
  "interview-questions": lazy(() => import("@/pages/tools/InterviewQuestions")),
  "interview-templates": lazy(() => import("@/pages/tools/InterviewTemplates")),
  "job-resume-match": lazy(() => import("@/pages/tools/JobResumeMatch")),
  "pdf-to-json": lazy(() => import("@/pages/tools/PdfToJson")),
  "predictive-assessments": lazy(() => import("@/pages/tools/PredictiveAssessments")),
  "profile-audit": lazy(() => import("@/pages/tools/ProfileAudit")),
  "resume-consolidator": lazy(() => import("@/pages/tools/ResumeConsolidator")),
  "resume-optimizer": lazy(() => import("@/pages/tools/ResumeOptimizer")),
  "resume-roast": lazy(() => import("@/pages/ResumeRoast")),
  "resume-tailor": lazy(() => import("@/pages/tools/ResumeTailor")),
  "salary-calculator": lazy(() => import("@/pages/tools/SalaryCalculator")),
  "sentiment-analysis": lazy(() => import("@/pages/tools/SentimentAnalysis")),
  "skill-extractor": lazy(() => import("@/pages/tools/SkillExtractor")),
  "summarize-resume": lazy(() => import("@/pages/tools/SummarizeResume")),
  "value-proposition": lazy(() => import("@/pages/tools/ValueProposition")),
  "vendor-sync": lazy(() => import("@/pages/tools/VendorSync")),
  "video-pitch-lab": lazy(() => import("@/pages/tools/VideoPitchLab")),
  "xyz-resume-review": lazy(() => import("@/pages/tools/XyzResumeReview")),
} as const satisfies Record<string, LazyExoticComponent<ComponentType>>;

export type ToolPageId = keyof typeof TOOL_PAGES;

/** The tool's page component, or null when the tool has no page of its own
 *  (it runs in the AI chat, the browser extension, …). */
export function toolPage(id: string): LazyExoticComponent<ComponentType> | null {
  return Object.prototype.hasOwnProperty.call(TOOL_PAGES, id) ? TOOL_PAGES[id as ToolPageId] : null;
}
