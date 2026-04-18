import {
  ArrowRight,
  Calculator,
  Chrome,
  Flame,
  MessageSquare,
  PenTool,
  Star,
  Target,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

type Tool = {
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accent: string;
};

const FEATURED_TOOLS: Tool[] = [
  {
    name: "Resume Optimizer",
    description: "AI analyzes and improves your resume for maximum ATS impact.",
    href: "/Tools/ResumeOptimizer",
    icon: Zap,
    accent: "bg-blue-100 text-brand-blue",
  },
  {
    name: "AI Resume Scorer",
    description: "Score your resume against the job description in seconds.",
    href: "/Tools/AIResumeScorer",
    icon: Star,
    accent: "bg-yellow-100 text-yellow-600",
  },
  {
    name: "Resume Tailor",
    description: "Rewrite your resume to match a specific role, instantly.",
    href: "/Tools/ResumeTailor",
    icon: PenTool,
    accent: "bg-purple-100 text-brand-purple",
  },
  {
    name: "Salary Calculator",
    description: "Know your worth with market data insights for your role.",
    href: "/Tools/SalaryCalculator",
    icon: Calculator,
    accent: "bg-green-100 text-green-600",
  },
  {
    name: "Interview Coach",
    description: "Practice interviews with AI — role-specific questions & feedback.",
    href: "/chat",
    icon: MessageSquare,
    accent: "bg-blue-100 text-brand-blue",
  },
  {
    name: "Job-Resume Match",
    description: "See how well your resume aligns with any job posting.",
    href: "/Tools/JobResumeMatch",
    icon: Target,
    accent: "bg-pink-100 text-pink-600",
  },
  {
    name: "Resume Roast",
    description: "Get brutally honest AI feedback on your resume.",
    href: "/tools/resume-roast",
    icon: Flame,
    accent: "bg-orange-100 text-orange-600",
  },
  {
    name: "Chrome Extensions",
    description: "Tailor resumes on any job board; source candidates from LinkedIn.",
    href: "/chrome-extension",
    icon: Chrome,
    accent: "bg-gray-100 text-gray-700",
  },
];

export default function FeaturedTools() {
  return (
    <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">
              AI Career Tools
            </h2>
          </div>
          <Link
            to="/tools"
            className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 group"
          >
            View all tools
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURED_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} to={tool.href} className="group">
                <Card className="h-full hover:shadow-md transition-shadow border-border/50">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${tool.accent}`}
                    >
                      <Icon className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">
                        {tool.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
