import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIProvider } from "@/lib/ai-context";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart-context";
import { isProduction } from "@/lib/config";
import { logger } from "@/lib/logger";
import { performanceMonitor } from "@/lib/performance";

// Critical components loaded immediately
import AIChatPanel from "./components/AIChatPanel";
import FloatingAIButton from "./components/FloatingAIButton";

// Critical pages (loaded immediately)
import Index from "./pages/Index";
import PersonaSelection from "./pages/PersonaSelection";

// Lazy load non-critical pages
const About = lazy(() => import("./pages/About"));
const Careers = lazy(() => import("./pages/Careers"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyCreatePage = lazy(() => import("./pages/CompanyCreatePage"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const CompanyEditPage = lazy(() => import("./pages/CompanyEditPage"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ForRecruiters = lazy(() => import("./pages/ForRecruiters"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const People = lazy(() => import("./pages/People"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Resumes = lazy(() => import("./pages/Resumes"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Settings = lazy(() => import("./pages/Settings"));
const Tasks = lazy(() => import("./pages/Tasks"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const Tools = lazy(() => import("./pages/Tools"));
const SentimentAnalysis = lazy(() => import("./pages/tools/SentimentAnalysis"));
const JobResumeMatch = lazy(() => import("./pages/tools/JobResumeMatch"));
const SummarizeResume = lazy(() => import("./pages/tools/SummarizeResume"));
const PdfToJson = lazy(() => import("./pages/tools/PdfToJson"));
const ResumeOptimizer = lazy(() => import("./pages/tools/ResumeOptimizer"));
const SalaryCalculator = lazy(() => import("./pages/tools/SalaryCalculator"));
const AIResumeScorer = lazy(() => import("./pages/tools/AIResumeScorer"));
const ValueProposition = lazy(() => import("./pages/tools/ValueProposition"));
const Outreach = lazy(() => import("./pages/Outreach"));
const Help = lazy(() => import("./pages/Help"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
// Auth pages (keep immediate for better UX)
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ConfirmEmail from "./pages/ConfirmEmail";
import SignupSuccess from "./pages/SignupSuccess";
import AcceptInvitation from "./pages/AcceptInvitation";

// Other pages (lazy loaded)
const NotFound = lazy(() => import("./pages/NotFound"));
const Profile = lazy(() => import("./pages/Profile"));
const ResumeDetail = lazy(() => import("./pages/ResumeDetail"));
const ResumeUploadPage = lazy(() => import("./pages/ResumeUploadPage"));
const ResumeCreatePage = lazy(() => import("./pages/ResumeCreatePage"));
const ResumeEditPage = lazy(() => import("./pages/ResumeEditPage"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const JobUploadPage = lazy(() => import("./pages/JobUploadPage"));
const JobCreatePage = lazy(() => import("./pages/JobCreatePage"));
const JobEditPage = lazy(() => import("./pages/JobEditPage"));
const PeopleDetail = lazy(() => import("./pages/PeopleDetail"));
const AccountManagement = lazy(() => import("./pages/AccountManagement"));
const EmbeddedResume = lazy(() => import("./pages/EmbeddedResume"));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// Create a client with production-ready configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: isProduction ? 3 : 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: isProduction,
    },
    mutations: {
      retry: isProduction ? 2 : 0,
      onError: (error) => {
        logger.error("Mutation error", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
  },
});

// Initialize performance monitoring
if (isProduction) {
  performanceMonitor.recordMemoryUsage();

  // Record memory usage periodically
  setInterval(() => {
    performanceMonitor.recordMemoryUsage();
  }, 60000); // Every minute
}

// Global error handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  logger.error("Unhandled promise rejection", {
    reason: event.reason,
    promise: event.promise,
  });

  // Prevent the default browser behavior
  event.preventDefault();
});

// Global error handler for uncaught errors
window.addEventListener("error", (event) => {
  logger.error("Uncaught error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

const App = () => (
  <ErrorBoundary
    level="critical"
    onError={(error, errorInfo) => {
      logger.error("Critical application error", {
        error: error.toJSON(),
        errorInfo,
      });
    }}
  >
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <AIProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/signup-success" element={<SignupSuccess />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/confirm-email" element={<ConfirmEmail />} />
                  <Route path="/accept-invitation" element={<AcceptInvitation />} />
                  <Route
                    path="/persona-selection"
                    element={<PersonaSelection />}
                  />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route
                    path="/features"
                    element={<Navigate to="/pricing" replace />}
                  />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/for-recruiters" element={<ForRecruiters />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/careers" element={<Careers />} />
                  <Route path="/resumes" element={<Resumes />} />
                  <Route
                    path="/resumes/upload"
                    element={<ResumeUploadPage />}
                  />
                  <Route
                    path="/resumes/create/:id"
                    element={<ResumeCreatePage />}
                  />
                  <Route
                    path="/resumes/edit/:id"
                    element={<ResumeEditPage />}
                  />
                  <Route path="/resumes/:id" element={<ResumeDetail />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/jobs/upload" element={<JobUploadPage />} />
                  <Route path="/jobs/create" element={<JobCreatePage />} />
                  <Route path="/jobs/create/:id" element={<JobCreatePage />} />
                  <Route path="/jobs/edit/:id" element={<JobEditPage />} />
                  <Route path="/jobs/:id" element={<JobDetail />} />
                  <Route path="/companies" element={<Companies />} />
                  <Route
                    path="/companies/create"
                    element={<CompanyCreatePage />}
                  />
                  <Route
                    path="/companies/create/:id"
                    element={<CompanyCreatePage />}
                  />
                  <Route
                    path="/companies/edit/:id"
                    element={<CompanyEditPage />}
                  />
                  <Route path="/companies/:id" element={<CompanyDetail />} />
                  <Route path="/people" element={<People />} />
                  <Route path="/people/:id" element={<PeopleDetail />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/tools" element={<Tools />} />
                  <Route path="/Tools/SentimentAnalysis" element={<SentimentAnalysis />} />
                  <Route path="/tools/sentiment-analysis" element={<SentimentAnalysis />} />
                  <Route path="/Tools/JobResumeMatch" element={<JobResumeMatch />} />
                  <Route path="/tools/job-resume-match" element={<JobResumeMatch />} />
                  <Route path="/Tools/SummarizeResume" element={<SummarizeResume />} />
                  <Route path="/tools/summarize-resume" element={<SummarizeResume />} />
                  <Route path="/Tools/pdftojson" element={<PdfToJson />} />
                  <Route path="/tools/pdf-to-json" element={<PdfToJson />} />
                  <Route path="/Tools/ResumeOptimizer" element={<ResumeOptimizer />} />
                  <Route path="/tools/resume-optimizer" element={<ResumeOptimizer />} />
                  <Route path="/Tools/SalaryCalculator" element={<SalaryCalculator />} />
                  <Route path="/tools/salary-calculator" element={<SalaryCalculator />} />
                  <Route path="/Tools/AIResumeScorer" element={<AIResumeScorer />} />
                  <Route path="/tools/ai-resume-scorer" element={<AIResumeScorer />} />
                  <Route path="/Tools/ValueProposition" element={<ValueProposition />} />
                  <Route path="/tools/value-proposition" element={<ValueProposition />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/outreach" element={<Outreach />} />
                  <Route path="/account" element={<AccountManagement />} />

                  <Route path="/settings" element={<Settings />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/insights/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route
                    path="/terms-of-service"
                    element={<TermsOfService />}
                  />
                  <Route path="/insights/terms-of-service" element={<TermsOfService />} />
                  <Route path="/insights/terms-of-use" element={<TermsOfService />} />
                  <Route path="/insights/how-to-use-job-match-analysis-tool" element={<Navigate to="/Tools/JobResumeMatch" replace />} />
                  <Route path="/cookies" element={<CookiePolicy />} />

                  {/* Embedded Resume Routes - Multiple patterns for backwards compatibility */}
                  <Route
                    path="/embedded-resume/:identifier"
                    element={<EmbeddedResume />}
                  />
                  <Route
                    path="/embedded/resume/:identifier"
                    element={<EmbeddedResume />}
                  />
                  <Route
                    path="/embedded/resumes/:identifier"
                    element={<EmbeddedResume />}
                  />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>

                {/* Global AI Components - Available on all pages */}
                <FloatingAIButton />
                <AIChatPanel />
              </BrowserRouter>
            </TooltipProvider>
          </AIProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")).render(<App />);
