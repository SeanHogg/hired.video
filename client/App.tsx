import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { AIProvider } from "@/lib/ai-context";
import { CartProvider } from "@/lib/cart-context";
import ErrorBoundary from "@/components/ErrorBoundary";
import { logger } from "@/lib/logger";
import { performanceMonitor } from "@/lib/performance";
import { config, isProduction } from "@/lib/config";
import FloatingAIButton from "./components/FloatingAIButton";
import AIChatPanel from "./components/AIChatPanel";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Features from "./pages/Features";
import Pricing from "./pages/Pricing";
import ForRecruiters from "./pages/ForRecruiters";
import About from "./pages/About";
import Resumes from "./pages/Resumes";
import Jobs from "./pages/Jobs";
import Companies from "./pages/Companies";
import People from "./pages/People";
import Tools from "./pages/Tools";
import Tasks from "./pages/Tasks";
import Outreach from "./pages/Outreach";

import Settings from "./pages/Settings";
import Help from "./pages/Help";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import CookiePolicy from "./pages/CookiePolicy";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import PersonaSelection from "./pages/PersonaSelection";
import Profile from "./pages/Profile";
import ResumeDetail from "./pages/ResumeDetail";
import ResumeUploadPage from "./pages/ResumeUploadPage";
import ResumeCreatePage from "./pages/ResumeCreatePage";
import ResumeEditPage from "./pages/ResumeEditPage";
import JobDetail from "./pages/JobDetail";
import JobUploadPage from "./pages/JobUploadPage";
import JobCreatePage from "./pages/JobCreatePage";
import JobEditPage from "./pages/JobEditPage";
import CompanyDetail from "./pages/CompanyDetail";
import CompanyCreatePage from "./pages/CompanyCreatePage";
import CompanyEditPage from "./pages/CompanyEditPage";
import PeopleDetail from "./pages/PeopleDetail";
import Checkout from "./pages/Checkout";

// Create a client with production-ready configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: isProduction ? 3 : 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: isProduction,
      onError: (error) => {
        logger.error('Query error', { error: error instanceof Error ? error.message : String(error) });
      },
    },
    mutations: {
      retry: isProduction ? 2 : 0,
      onError: (error) => {
        logger.error('Mutation error', { error: error instanceof Error ? error.message : String(error) });
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
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', {
    reason: event.reason,
    promise: event.promise,
  });

  // Prevent the default browser behavior
  event.preventDefault();
});

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  logger.error('Uncaught error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

const App = () => (
  <ErrorBoundary level="critical" onError={(error, errorInfo) => {
    logger.error('Critical application error', {
      error: error.toJSON(),
      errorInfo,
    });
  }}>
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
                <Route path="/resumes/upload" element={<ResumeUploadPage />} />
                <Route
                  path="/resumes/create/:id"
                  element={<ResumeCreatePage />}
                />
                <Route path="/resumes/edit/:id" element={<ResumeEditPage />} />
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
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/outreach" element={<Outreach />} />

                <Route path="/settings" element={<Settings />} />
                <Route path="/help" element={<Help />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/cookies" element={<CookiePolicy />} />
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

createRoot(document.getElementById("root")!).render(<App />);
