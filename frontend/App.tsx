import "./global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIProvider } from "@/lib/ai-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PermissionDebuggerProvider } from "@/providers/PermissionDebuggerProvider";
import { PersonaPreviewProvider } from "@/providers/PersonaPreviewProvider";
import { PermissionDebuggerPanel } from "@/components/PermissionDebuggerPanel";
import { CartProvider } from "@/lib/cart-context";
import { runtimeConfig } from "@/lib/runtime-config";
import { logger } from "@/lib/logger";
import { performanceMonitor } from "@/lib/performance";
import { initializeErrorTracking, reportError, reportMessage } from "@/lib/error-tracking";

// Critical components loaded immediately
import AIChatPanel from "./components/AIChatPanel";
import FloatingAIButton from "./components/FloatingAIButton";
import ChatPanel from "./components/ChatPanel";
import MobileBottomNav from "./components/MobileBottomNav";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

// Critical pages (loaded immediately)
import Index from "./pages/Index";
import PersonaSelection from "./pages/PersonaSelection";
// Auth pages (keep immediate for better UX)
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ConfirmEmail from "./pages/ConfirmEmail";
import VerifyEmail from "./pages/VerifyEmail";
import OAuthCallback from "./pages/OAuthCallback";
import MagicLinkVerify from "./pages/MagicLinkVerify";
import SignupSuccess from "./pages/SignupSuccess";
import AcceptInvitation from "./pages/AcceptInvitation";

// Lazy load non-critical pages
const BlogIndex = lazy(() => import("./pages/blog/BlogIndex"));
const BlogPost = lazy(() => import("./pages/blog/BlogPost"));
const PostAJob = lazy(() => import("./pages/PostAJob"));
const SalaryPage = lazy(() => import("./pages/seo/SalaryPage"));
const ResumeGuidePage = lazy(() => import("./pages/seo/ResumeGuidePage"));
const About = lazy(() => import("./pages/About"));
const Careers = lazy(() => import("./pages/Careers"));
const Checkout = lazy(() => import("./pages/Checkout"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyCreatePage = lazy(() => import("./pages/CompanyCreatePage"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const CompanyEditPage = lazy(() => import("./pages/CompanyEditPage"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Home = lazy(() => import("./pages/Home"));
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
const ResumeTailor = lazy(() => import("./pages/tools/ResumeTailor"));
const FormAutofill = lazy(() => import("./pages/tools/FormAutofill"));
const ResumeConsolidator = lazy(() => import("./pages/tools/ResumeConsolidator"));
const Outreach = lazy(() => import("./pages/Outreach"));
const PhoneDashboard = lazy(() => import("./pages/PhoneDashboard"));
const Help = lazy(() => import("./pages/Help"));
const GettingStartedGuide = lazy(() => import("./pages/guides/GettingStarted"));
const VideoBestPracticesGuide = lazy(() => import("./pages/guides/VideoBestPractices"));
const NetworkingTipsGuide = lazy(() => import("./pages/guides/NetworkingTips"));
const JobSearchStrategiesGuide = lazy(() => import("./pages/guides/JobSearchStrategies"));
const TutorialsGuide = lazy(() => import("./pages/guides/Tutorials"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
const AffiliateProgram = lazy(() => import("./pages/AffiliateProgram"));

const AICoach = lazy(() => import("./pages/AICoach"));
const ChromeExtension = lazy(() => import("./pages/ChromeExtension"));
const InterviewPractice = lazy(() => import("./pages/InterviewPractice"));


// Other pages (lazy loaded)
const NotFound = lazy(() => import("./pages/NotFound"));
const Profile = lazy(() => import("./pages/Profile"));
const ResumeDetail = lazy(() => import("./pages/ResumeDetail"));
const ResumeUploadPage = lazy(() => import("./pages/ResumeUploadPage"));
const ResumeCreatePage = lazy(() => import("./pages/ResumeCreatePage"));
const ResumeEditPage = lazy(() => import("./pages/ResumeEditPage"));
const VideoResumeWizardPage = lazy(() => import("./pages/VideoResumeWizardPage"));
const Studio = lazy(() => import("./pages/studio/Studio"));
const ATSLandingPage = lazy(() => import("./pages/studio/ATSLandingPage"));
const AsyncInterviewPage = lazy(() => import("./pages/studio/AsyncInterviewPage"));
const ResumeRoast = lazy(() => import("./pages/ResumeRoast"));
const PublicVideoResume = lazy(() => import("./pages/PublicVideoResume"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
// JobUploadPage removed - functionality consolidated into JobCreatePage
const JobCreatePage = lazy(() => import("./pages/JobCreatePage"));
const JobEditPage = lazy(() => import("./pages/JobEditPage"));
const JobApplicationPage = lazy(() => import("./pages/JobApplicationPage"));
const PeopleDetail = lazy(() => import("./pages/PeopleDetail"));
const ServicesManagement = lazy(() => import("./pages/ServicesManagement"));
const EmbeddedResume = lazy(() => import("./pages/EmbeddedResume"));
const ProductDashboard = lazy(() => import("./pages/admin/ProductDashboard"));
const FeedManagement = lazy(() => import("./pages/admin/FeedManagement"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const RolesPermissions = lazy(() => import("./pages/admin/RolesPermissions"));
const JobsManagement = lazy(() => import("./pages/admin/JobsManagement"));
const StudioManagement = lazy(() => import("./pages/admin/StudioManagement"));
const BillingManagement = lazy(() => import("./pages/admin/BillingManagement"));
const ModuleManagement = lazy(() => import("./pages/admin/ModuleManagement"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));
const SystemSettings = lazy(() => import("./pages/admin/SystemSettings"));
import AdminLayout from "./components/admin/AdminLayout";

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

// Simple route guards
function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuthSafe();
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return children;
}

function RequireVerified({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuthSafe();
  // Avoid false redirects while auth/verification status is initializing
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  if (isEmailVerified === false) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/verify-email?${params.toString()}`} replace />;
  }
  return children;
}

function useAuthSafe() {
  // Directly use the Auth context; avoid brittle require()-based fallback that can misreport state
  return useAuth();
}

// Create a client with production-ready configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: runtimeConfig.isProduction ? 3 : 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: runtimeConfig.isProduction,
    },
    mutations: {
      retry: runtimeConfig.isProduction ? 2 : 0,
      onError: (error) => {
        logger.error("Mutation error", {
          error: error instanceof Error ? error.message : String(error),
        });

        // Report to error tracking
        if (error instanceof Error) {
          reportError(error, { type: "mutation" });
        } else {
          reportMessage(`Mutation error: ${String(error)}`, "error", { type: "mutation" });
        }
      },
    },
  },
});

// Initialize error tracking (GlitchTip/Sentry compatible)
initializeErrorTracking();

// Log current configuration in development
if (runtimeConfig.isDevelopment) {
  runtimeConfig.logConfig();
}

// Initialize performance monitoring
if (runtimeConfig.performance.MONITORING) {
  performanceMonitor.recordMemoryUsage();

  // Record memory usage periodically
  setInterval(() => {
    performanceMonitor.recordMemoryUsage();
  }, 60000); // Every minute
}

// Global error handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const error = new Error(`Unhandled promise rejection: ${event.reason}`);
  logger.error("Unhandled promise rejection", {
    reason: event.reason,
    promise: event.promise,
  });

  // Report to error tracking
  reportError(error, {
    type: "unhandledrejection",
    reason: event.reason,
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

  // Report to error tracking
  if (event.error) {
    reportError(event.error, {
      type: "uncaughterror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  }
});


function ReferralCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (code) {
        sessionStorage.setItem("ref", code);
      }
    } catch {
      // no-op
    }
  }, []);
  return null;
}

// Fires a GTM page_view event on every SPA route change.
// Also captures UTM parameters into sessionStorage so they survive navigation.
function GTMPageTracker() {
  const location = useLocation();

  useEffect(() => {
    try {
      // Capture UTM params on first hit
      const params = new URLSearchParams(location.search);
      const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
      utmKeys.forEach((key) => {
        const val = params.get(key);
        if (val) sessionStorage.setItem(key, val);
      });

      // Push page_view to GTM dataLayer
      const w = window as any;
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: "page_view",
        page_path: location.pathname + location.search,
        page_title: document.title,
        utm_source: sessionStorage.getItem("utm_source") || undefined,
        utm_medium: sessionStorage.getItem("utm_medium") || undefined,
        utm_campaign: sessionStorage.getItem("utm_campaign") || undefined,
        utm_term: sessionStorage.getItem("utm_term") || undefined,
        utm_content: sessionStorage.getItem("utm_content") || undefined,
      });
    } catch {
      // no-op
    }
  }, [location.pathname, location.search]);

  return null;
}

const App = () => (
  <ErrorBoundary
    level="critical"
    onError={(error, errorInfo) => {
      logger.error("Critical application error", {
        error: error.message,
        errorInfo,
      });

      // Report to error tracking
      reportError(error, {
        type: "react-error-boundary",
        errorInfo,
      });
    }}
  >
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PersonaPreviewProvider>
        <PermissionDebuggerProvider>
          <CartProvider>
            <AIProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <GlobalErrorHandler />
                <PWAUpdatePrompt />
                <BrowserRouter>
	                  <ReferralCapture />
                  <GTMPageTracker />

                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<Index />} />

                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route
                        path="/signup-success"
                        element={<SignupSuccess />}
                      />
                      <Route
                        path="/forgot-password"
                        element={<ForgotPassword />}
                      />
                      <Route
                        path="/reset-password"
                        element={<ResetPassword />}
                      />
                          <Route path="/verify-email" element={<VerifyEmail />} />

                      <Route path="/confirm-email" element={<ConfirmEmail />} />
                      <Route path="/auth/callback" element={<OAuthCallback />} />
                      <Route path="/auth/magic-link" element={<MagicLinkVerify />} />
                      <Route
                        path="/accept-invitation"
                        element={<AcceptInvitation />}
                      />
                      <Route
                        path="/persona-selection"
                        element={<PersonaSelection />}
                      />
                      <Route path="/profile" element={<RequireVerified><Profile /></RequireVerified>} />
                      <Route path="/home" element={<Home />} />
                      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                      <Route path="/feed" element={<Navigate to="/home" replace />} />
                      <Route path="/onboarding" element={<RequireVerified><Onboarding /></RequireVerified>} />
                      <Route
                        path="/features"
                        element={<Navigate to="/pricing" replace />}
                      />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route
                        path="/for-recruiters"
                        element={<ForRecruiters />}
                      />
                      <Route path="/about" element={<About />} />
                      <Route path="/careers" element={<Careers />} />
                      <Route path="/resumes" element={<Resumes />} />
                      <Route
                        path="/resumes/upload"
                        element={<RequireVerified><ResumeUploadPage /></RequireVerified>}
                      />
                      <Route
                        path="/resumes/upload/video"
                        element={<RequireVerified><VideoResumeWizardPage /></RequireVerified>}
                      />
                      <Route path="/studio" element={<Studio />} />
                      <Route path="/interview" element={<InterviewPractice />} />
                      <Route path="/resume-roast" element={<ResumeRoast />} />
                      <Route path="/tools/resume-roast" element={<ResumeRoast />} />
                      <Route path="/post-a-job" element={<PostAJob />} />
                      <Route path="/blog" element={<BlogIndex />} />
                      <Route path="/blog/:slug" element={<BlogPost />} />
                      <Route path="/salary/:jobSlug" element={<SalaryPage />} />
                      <Route path="/resume-guide/:jobSlug" element={<ResumeGuidePage />} />
                      <Route
                        path="/resumes/create/:id"
                        element={<ResumeCreatePage />}
                      />
                      <Route
                        path="/resumes/edit/:id"
                        element={<ResumeEditPage />}
                      />
                      <Route path="/resumes/:id" element={<ResumeDetail />} />
	                      <Route path="/resume/:id" element={<ResumeDetail />} />
                      <Route path="/jobs" element={<Jobs />} />
                      <Route path="/jobs/create" element={<JobCreatePage />} />
                      <Route
                        path="/jobs/create/:id"
                        element={<JobCreatePage />}
                      />
                      <Route path="/jobs/edit/:id" element={<JobEditPage />} />
                      <Route path="/jobs/:id/apply" element={<JobApplicationPage />} />
                      <Route path="/jobs/:id" element={<JobDetail />} />
                      {/* Redirect old upload route to unified create page */}
                      <Route
                        path="/jobs/upload"
                        element={<Navigate to="/jobs/create" replace />}
                      />
                      <Route path="/companies" element={<Companies />} />
                      <Route
                        path="/companies/create"
                        element={<CompanyCreatePage />}
                      />
                      <Route path="/affiliate-program" element={<AffiliateProgram />} />
                      <Route path="/affiliate/dashboard" element={<Navigate to="/services" replace />} />

                      <Route
                        path="/companies/create/:id"
                        element={<CompanyCreatePage />}
                      />
                      <Route
                        path="/companies/edit/:id"
                        element={<CompanyEditPage />}
                      />
                      <Route
                        path="/companies/:id"
                        element={<CompanyDetail />}
                      />
                      <Route path="/people" element={<People />} />
                      <Route path="/people/:id" element={<PeopleDetail />} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/checkout/success" element={<CheckoutSuccess />} />
                      <Route path="/tools" element={<Tools />} />
                      <Route path="/chat" element={<AICoach />} />
                      <Route path="/ai-coach" element={<AICoach />} />
                      <Route
                        path="/Tools/SentimentAnalysis"
                        element={<SentimentAnalysis />}
                      />
                      <Route
                        path="/tools/sentiment-analysis"
                        element={<SentimentAnalysis />}
                      />
                      <Route
                        path="/Tools/JobResumeMatch"
                        element={<JobResumeMatch />}
                      />
                      <Route
                        path="/tools/job-resume-match"
                        element={<JobResumeMatch />}
                      />
                      <Route
                        path="/Tools/SummarizeResume"
                        element={<SummarizeResume />}
                      />
                      <Route
                        path="/tools/summarize-resume"
                        element={<SummarizeResume />}
                      />
                      <Route path="/Tools/pdftojson" element={<PdfToJson />} />
                      <Route
                        path="/tools/pdf-to-json"
                        element={<PdfToJson />}
                      />
                      <Route
                        path="/Tools/ResumeOptimizer"
                        element={<ResumeOptimizer />}
                      />
                      <Route
                        path="/tools/resume-optimizer"
                        element={<ResumeOptimizer />}
                      />
                      <Route
                        path="/Tools/SalaryCalculator"
                        element={<SalaryCalculator />}
                      />
                      <Route
                        path="/tools/salary-calculator"
                        element={<SalaryCalculator />}
                      />
                      <Route
                        path="/Tools/AIResumeScorer"
                        element={<AIResumeScorer />}
                      />
                      <Route
                        path="/tools/ai-resume-scorer"
                        element={<AIResumeScorer />}
                      />
                      <Route
                        path="/Tools/ValueProposition"
                        element={<ValueProposition />}
                      />
                      <Route
                        path="/tools/value-proposition"
                        element={<ValueProposition />}
                      />
                      <Route
                        path="/Tools/ResumeTailor"
                        element={<ResumeTailor />}
                      />
                      <Route
                        path="/tools/resume-tailor"
                        element={<ResumeTailor />}
                      />
                      <Route
                        path="/tools/form-autofill"
                        element={<FormAutofill />}
                      />
                      <Route
                        path="/tools/resume-consolidator"
                        element={<ResumeConsolidator />}
                      />
                      <Route path="/tasks" element={<Tasks />} />
                      <Route path="/outreach" element={<Outreach />} />
                      <Route path="/phone" element={<PhoneDashboard />} />
                      <Route path="/services" element={<ServicesManagement />} />
                      <Route path="/services/inquiries" element={<Navigate to="/services" replace />} />
                      <Route path="/account" element={<Navigate to="/settings" replace />} />
                      {/* Admin routes — wrapped in AdminLayout horizontal tab bar */}
                      <Route path="/admin/dashboard"         element={<AdminLayout><ProductDashboard /></AdminLayout>} />
                      <Route path="/admin/feed"              element={<AdminLayout><FeedManagement /></AdminLayout>} />
                      <Route path="/admin/users"             element={<AdminLayout><UserManagement /></AdminLayout>} />
                      <Route path="/admin/roles"             element={<AdminLayout><RolesPermissions /></AdminLayout>} />
                      <Route path="/admin/jobs"              element={<AdminLayout><JobsManagement /></AdminLayout>} />
                      <Route path="/admin/studio"            element={<AdminLayout><StudioManagement /></AdminLayout>} />
                      <Route path="/admin/billing"           element={<AdminLayout><BillingManagement /></AdminLayout>} />
                      <Route path="/admin/modules"           element={<AdminLayout><ModuleManagement /></AdminLayout>} />
                      <Route path="/admin/audit"             element={<AdminLayout><AuditLog /></AdminLayout>} />
                      <Route path="/admin/settings"          element={<AdminLayout><SystemSettings /></AdminLayout>} />
                      {/* Legacy redirect */}
                      <Route path="/admin/product-dashboard" element={<Navigate to="/admin/dashboard" replace />} />

                      <Route path="/settings" element={<Settings />} />
                      <Route path="/help" element={<Help />} />
                      <Route path="/guides/getting-started" element={<GettingStartedGuide />} />
                      <Route path="/guides/video-best-practices" element={<VideoBestPracticesGuide />} />
                      <Route path="/guides/networking" element={<NetworkingTipsGuide />} />
                      <Route path="/guides/job-search" element={<JobSearchStrategiesGuide />} />
                      <Route path="/guides/tutorials" element={<TutorialsGuide />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/contact-us" element={<Navigate to="/contact" replace />} />
                      <Route
                        path="/privacy-policy"
                        element={<PrivacyPolicy />}
                      />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route
                        path="/insights/privacy-policy"
                        element={<PrivacyPolicy />}
                      />
                      <Route path="/terms" element={<TermsOfService />} />
                      <Route
                        path="/terms-of-service"
                        element={<TermsOfService />}
                      />
                      <Route
                        path="/insights/terms-of-service"
                        element={<TermsOfService />}
                      />
                      <Route
                        path="/insights/terms-of-use"
                        element={<TermsOfService />}
                      />
                      <Route
                        path="/insights/how-to-use-job-match-analysis-tool"
                        element={
                          <Navigate to="/Tools/JobResumeMatch" replace />
                        }
                      />
                      <Route
                        path="/chrome-extension"
                        element={<ChromeExtension />}
                      />
                      <Route
                        path="/insights/how-to-use-job-seeker-chrome-plugin-extension"
                        element={<ChromeExtension />}
                      />
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

                      {/* Public video resume page */}
                      <Route path="/v/:videoId" element={<PublicVideoResume />} />

                      {/* ATS-compatible shareable video resume landing page */}
                      <Route path="/v/ats/:slug" element={<ATSLandingPage />} />

                      {/* Async video interview — candidate view */}
                      <Route path="/interview/:token" element={<AsyncInterviewPage />} />

                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>

                  </Suspense>

                  {/* Mobile bottom nav spacer to prevent content being hidden */}
                  <div className="h-16 md:hidden" />
                  <MobileBottomNav />

                  {/* Global AI Components - Available on all pages */}
                  <FloatingAIButton />
                  <AIChatPanel />
                  {/* Global human-to-human chat mini-windows. Opened by the
                      CommunicationHub bell in the Navigation header. */}
                  <ChatPanel />
                  <PWAInstallPrompt />
                </BrowserRouter>
              </TooltipProvider>
            </AIProvider>
          </CartProvider>
          <PermissionDebuggerPanel />
        </PermissionDebuggerProvider>
        </PersonaPreviewProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")).render(<App />);
