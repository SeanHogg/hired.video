import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { AIProvider } from "@/lib/ai-context";
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
import Watch from "./pages/Watch";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AIProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/persona-selection" element={<PersonaSelection />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/features" element={<Navigate to="/pricing" replace />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/for-recruiters" element={<ForRecruiters />} />
              <Route path="/about" element={<About />} />
              <Route path="/resumes" element={<Resumes />} />
              <Route path="/resumes/upload" element={<ResumeUploadPage />} />
              <Route path="/resumes/create/:id" element={<ResumeCreatePage />} />
              <Route path="/resumes/edit/:id" element={<ResumeEditPage />} />
              <Route path="/resumes/:id" element={<ResumeDetail />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/upload" element={<JobUploadPage />} />
              <Route path="/jobs/create" element={<JobCreatePage />} />
              <Route path="/jobs/create/:id" element={<JobCreatePage />} />
              <Route path="/jobs/edit/:id" element={<JobEditPage />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/companies" element={<Companies />} />
              <Route path="/companies/create" element={<CompanyCreatePage />} />
              <Route path="/companies/create/:id" element={<CompanyCreatePage />} />
              <Route path="/companies/edit/:id" element={<CompanyEditPage />} />
              <Route path="/companies/:id" element={<CompanyDetail />} />
              <Route path="/people" element={<People />} />
              <Route path="/people/:id" element={<PeopleDetail />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/outreach" element={<Outreach />} />
              <Route path="/watch" element={<Watch />} />
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
    </AuthProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
