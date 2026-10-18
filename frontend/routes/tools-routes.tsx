// Checkout, tools, AI coach, interview + recruit pipeline routes (third
// block of the app route table — routes/index.tsx keeps the original order).
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";
import { TOOL_PAGES } from "@/components/tools/tool-pages";
import { LiveScreenInvite } from "./jobs-people-routes";

const Checkout = lazy(() => import("@/pages/Checkout"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));
const CompAnalyzer = TOOL_PAGES["comp-analyzer"];
const Tasks = lazy(() => import("@/pages/Tasks"));
const Tools = lazy(() => import("@/pages/Tools"));
const SentimentAnalysis = TOOL_PAGES["sentiment-analysis"];
const PredictiveAssessments = TOOL_PAGES["predictive-assessments"];
const JobResumeMatch = TOOL_PAGES["job-resume-match"];
const SummarizeResume = TOOL_PAGES["summarize-resume"];
const PdfToJson = TOOL_PAGES["pdf-to-json"];
const ResumeOptimizer = TOOL_PAGES["resume-optimizer"];
const SalaryCalculator = TOOL_PAGES["salary-calculator"];
const EmployerResearch = TOOL_PAGES["employer-research"];
const AIResumeScorer = TOOL_PAGES["ai-resume-scorer"];
const ValueProposition = TOOL_PAGES["value-proposition"];
const ResumeTailor = TOOL_PAGES["resume-tailor"];
const FormAutofill = TOOL_PAGES["form-autofill"];
const ResumeConsolidator = TOOL_PAGES["resume-consolidator"];
const XyzResumeReview = TOOL_PAGES["xyz-resume-review"];
const SkillExtractor = TOOL_PAGES["skill-extractor"];
const ProfileAudit = TOOL_PAGES["profile-audit"];
const Career360 = TOOL_PAGES["career-360"];
const InterviewQuestions = TOOL_PAGES["interview-questions"];
const InterviewTemplates = TOOL_PAGES["interview-templates"];
const VideoPitchLab = TOOL_PAGES["video-pitch-lab"];
const MyInterviewAssignments = lazy(() => import("@/pages/MyInterviewAssignments"));
const CrossJobPipeline = lazy(() => import("@/pages/recruit/CrossJobPipeline"));
const LiveScreens = lazy(() => import("@/pages/recruit/LiveScreens"));
const AgentRuns = lazy(() => import("@/pages/recruit/AgentRuns"));
const VendorSync = TOOL_PAGES["vendor-sync"];
const ToolDetail = lazy(() => import("@/pages/ToolDetail"));
const Outreach = lazy(() => import("@/pages/Outreach"));
const PhoneDashboard = lazy(() => import("@/pages/PhoneDashboard"));
const AICoach = lazy(() => import("@/pages/AICoach"));

export const toolsRoutes = (
  <>
    <Route path="/checkout" element={<Checkout />} />
    <Route path="/checkout/success" element={<CheckoutSuccess />} />
    <Route path="/tools" element={<Tools />} />
    {/* /learning is the SEO-friendly alias for the
        built-in Learning Content Library tab on /tools.
        Same page, learning tab pre-selected. */}
    <Route path="/learning" element={<Navigate to="/tools?tab=learning" replace />} />
    <Route path="/chat" element={<AICoach />} />
    <Route path="/ai-coach" element={<AICoach />} />
    {/* Legacy PascalCase tool routes — redirect to the
        kebab-case canonical so we ship one URL per tool.
        `useSEO` already emits `rel=canonical`, but a 308
        via <Navigate replace> kills the duplicate-content
        ambiguity for crawlers and analytics outright. */}
    <Route path="/Tools/SentimentAnalysis" element={<Navigate to="/tools/sentiment-analysis" replace />} />
    <Route path="/tools/sentiment-analysis" element={<SentimentAnalysis />} />
    <Route path="/tools/comp-analyzer" element={<CompAnalyzer />} />
    <Route path="/tools/predictive-assessments" element={<PredictiveAssessments />} />
    <Route path="/Tools/JobResumeMatch" element={<Navigate to="/tools/job-resume-match" replace />} />
    <Route path="/tools/job-resume-match" element={<JobResumeMatch />} />
    <Route path="/Tools/SummarizeResume" element={<Navigate to="/tools/summarize-resume" replace />} />
    <Route path="/tools/summarize-resume" element={<SummarizeResume />} />
    <Route path="/Tools/pdftojson" element={<Navigate to="/tools/pdf-to-json" replace />} />
    <Route path="/Tools/PdfToJson" element={<Navigate to="/tools/pdf-to-json" replace />} />
    <Route path="/tools/pdf-to-json" element={<PdfToJson />} />
    <Route path="/Tools/ResumeOptimizer" element={<Navigate to="/tools/resume-optimizer" replace />} />
    <Route path="/tools/resume-optimizer" element={<ResumeOptimizer />} />
    <Route path="/Tools/SalaryCalculator" element={<Navigate to="/tools/salary-calculator" replace />} />
    <Route path="/tools/salary-calculator" element={<SalaryCalculator />} />
    <Route path="/tools/employer-research" element={<EmployerResearch />} />
    <Route path="/Tools/AIResumeScorer" element={<Navigate to="/tools/ai-resume-scorer" replace />} />
    <Route path="/tools/ai-resume-scorer" element={<AIResumeScorer />} />
    <Route path="/Tools/ValueProposition" element={<Navigate to="/tools/value-proposition" replace />} />
    <Route path="/tools/value-proposition" element={<ValueProposition />} />
    <Route path="/Tools/ResumeTailor" element={<Navigate to="/tools/resume-tailor" replace />} />
    <Route path="/tools/resume-tailor" element={<ResumeTailor />} />
    <Route path="/Tools/AutoFill" element={<Navigate to="/tools/auto-fill" replace />} />
    <Route path="/tools/auto-fill" element={<FormAutofill />} />
    <Route path="/Tools/ResumeConsolidator" element={<Navigate to="/tools/resume-consolidator" replace />} />
    <Route path="/tools/resume-consolidator" element={<ResumeConsolidator />} />
    <Route path="/tools/xyz-resume-review" element={<XyzResumeReview />} />
    <Route path="/Tools/SkillExtractor" element={<Navigate to="/tools/skill-extractor" replace />} />
    <Route path="/tools/skill-extractor" element={<SkillExtractor />} />
    <Route
      path="/tools/profile-audit"
      element={<ProfileAudit />}
    />
    <Route
      path="/tools/career-360"
      element={<Career360 />}
    />
    <Route
      path="/tools/interview-questions"
      element={<InterviewQuestions />}
    />
    <Route
      path="/tools/interview-templates"
      element={<InterviewTemplates />}
    />
    <Route
      path="/tools/video-pitch-lab"
      element={<VideoPitchLab />}
    />
    <Route
      path="/interview-assignments"
      element={<MyInterviewAssignments />}
    />
    <Route
      path="/interview-assignments/compare"
      element={<MyInterviewAssignments />}
    />
    <Route
      path="/interview-assignments/:id"
      element={<MyInterviewAssignments />}
    />
    <Route
      path="/recruit/pipeline"
      element={<HiringRouteGate><CrossJobPipeline /></HiringRouteGate>}
    />
    <Route
      path="/recruit/live-screens"
      element={<HiringRouteGate><LiveScreens /></HiringRouteGate>}
    />
    <Route
      path="/recruit/agent"
      element={<HiringRouteGate><AgentRuns /></HiringRouteGate>}
    />
    <Route
      path="/live-screen/:token"
      element={<LiveScreenInvite />}
    />
    <Route
      path="/tools/vendor-sync"
      element={<VendorSync />}
    />
    {/* Per-tool detail / SEO page — must come after every
        specific `/tools/<slug>` route above, otherwise the
        `:id` param matches first and swallows them. */}
    <Route
      path="/tools/:id"
      element={<ToolDetail />}
    />
    <Route path="/tasks" element={<Tasks />} />
    <Route path="/outreach" element={<Outreach />} />
    <Route path="/phone" element={<PhoneDashboard />} />
  </>
);
