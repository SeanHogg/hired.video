import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import AIChatPanel from "./components/AIChatPanel";
import FloatingAIButton from "./components/FloatingAIButton";
import About from "./pages/About";
import Checkout from "./pages/Checkout";
import Companies from "./pages/Companies";
import CompanyCreatePage from "./pages/CompanyCreatePage";
import CompanyDetail from "./pages/CompanyDetail";
import CompanyEditPage from "./pages/CompanyEditPage";
import CookiePolicy from "./pages/CookiePolicy";
import Dashboard from "./pages/Dashboard";

import ForRecruiters from "./pages/ForRecruiters";
import Index from "./pages/Index";
import Onboarding from "./pages/Onboarding";
import People from "./pages/People";
import PersonaSelection from "./pages/PersonaSelection";
import Pricing from "./pages/Pricing";
import Resumes from "./pages/Resumes";
import Jobs from "./pages/Jobs";
import Settings from "./pages/Settings";
import Tasks from "./pages/Tasks";
import TermsOfService from "./pages/TermsOfService";
import Tools from "./pages/Tools";
import SentimentAnalysis from "./pages/tools/SentimentAnalysis";
import JobResumeMatch from "./pages/tools/JobResumeMatch";
import SummarizeResume from "./pages/tools/SummarizeResume";
import PdfToJson from "./pages/tools/PdfToJson";
import Outreach from "./pages/Outreach";
import Help from "./pages/Help";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import ResumeDetail from "./pages/ResumeDetail";
import ResumeUploadPage from "./pages/ResumeUploadPage";
import ResumeCreatePage from "./pages/ResumeCreatePage";
import ResumeEditPage from "./pages/ResumeEditPage";
import JobDetail from "./pages/JobDetail";
import JobUploadPage from "./pages/JobUploadPage";
import JobCreatePage from "./pages/JobCreatePage";
import JobEditPage from "./pages/JobEditPage";
import PeopleDetail from "./pages/PeopleDetail";
import AccountManagement from "./pages/AccountManagement";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ConfirmEmail from "./pages/ConfirmEmail";
import SignupSuccess from "./pages/SignupSuccess";
import EmbeddedResume from "./pages/EmbeddedResume";

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
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/signup-success" element={<SignupSuccess />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/confirm-email" element={<ConfirmEmail />} />
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
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/outreach" element={<Outreach />} />
                  <Route path="/account" element={<AccountManagement />} />

                  <Route path="/settings" element={<Settings />} />
                  <Route path="/help" element={<Help />} />
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
