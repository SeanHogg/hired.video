import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/for-recruiters" element={<ForRecruiters />} />
          <Route path="/about" element={<About />} />
          <Route path="/resumes" element={<Resumes />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/people" element={<People />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/outreach" element={<Outreach />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
