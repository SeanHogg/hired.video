import {
  ArrowLeft,
  ArrowRight,
  FileSearch,
  Bell,
  Video,
  ClipboardList,
  BotMessageSquare,
  DollarSign,
  CalendarCheck,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

const strategies = [
  {
    number: 1,
    title: "Optimize Your Resume for Each Role",
    icon: FileSearch,
    content:
      "Use the Resume Tailor tool to customize your resume for specific job postings. Highlight the skills and experience that match each role's requirements. AI-optimized resumes get 3x more callbacks than generic ones.",
  },
  {
    number: 2,
    title: "Set Up Smart Job Alerts",
    icon: Bell,
    content:
      "Configure notifications in Settings for your target roles, industries, and locations. Smart alerts learn from your preferences over time to surface the most relevant opportunities. Get matched jobs delivered directly to your inbox so you never miss a great fit.",
  },
  {
    number: 3,
    title: "Apply with Video",
    icon: Video,
    content:
      "Attach your video resume to applications to stand out from the crowd. Candidates with video resumes are 2x more likely to get an interview. Use the Studio to record a polished introduction that showcases your personality and communication skills.",
  },
  {
    number: 4,
    title: "Track Your Applications",
    icon: ClipboardList,
    content:
      "Use the Jobs dashboard to monitor application status, follow up at the right time, and keep notes on each opportunity. Staying organized prevents missed deadlines and duplicate applications. Review your pipeline weekly to prioritize your highest-potential leads.",
  },
  {
    number: 5,
    title: "Prepare with AI Coach",
    icon: BotMessageSquare,
    content:
      "Use our AI Interview Coach to practice common interview questions and get real-time feedback on your answers. The coach analyzes your delivery, pacing, and content to help you improve before the real thing. Run through mock sessions for each role you're targeting.",
  },
  {
    number: 6,
    title: "Use the Salary Calculator",
    icon: DollarSign,
    content:
      "Research fair compensation with our Salary Calculator tool before negotiating. Enter your role, experience level, and location to see market benchmarks. Know your market value so you can confidently discuss salary expectations with employers.",
  },
  {
    number: 7,
    title: "Stay Consistent",
    icon: CalendarCheck,
    content:
      "Job searching is a numbers game — aim to apply to 5-10 relevant positions per week and follow up within 3-5 business days. Block dedicated time on your calendar for searching, applying, and networking. Consistency compounds over time and dramatically increases your chances of landing the right role.",
  },
];

export default function JobSearchStrategies() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Help & Support", url: "/help" },
    { name: "Job Search Strategies", url: "/guides/job-search" },
  ]);
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Back link */}
            <Link
              to="/help"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Help & Support
            </Link>

            {/* Page header */}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Job Search Strategies
              </h1>
              <p className="text-muted-foreground mt-2">
                Proven tactics to accelerate your job search using hired.video's
                tools. Follow these seven strategies to maximize your visibility
                and land more interviews.
              </p>
            </div>

            {/* Strategy cards */}
            {strategies.map((strategy) => {
              const Icon = strategy.icon;
              return (
                <Card key={strategy.number}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                        {strategy.number}
                      </span>
                      <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                      {strategy.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {strategy.content}
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            {/* Navigation links */}
            <div className="flex justify-between items-center pt-4 pb-8">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/guides/networking">
                  <ArrowLeft className="h-4 w-4" /> Previous: Networking Tips
                </Link>
              </Button>
              <Link
                to="/help"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back to Help Center
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
