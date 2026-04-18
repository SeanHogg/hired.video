import {
  ArrowLeft,
  Play,
  UserPlus,
  Video,
  Mic,
  FileSearch,
  Bell,
  MessageSquare,
  Mail,
  Briefcase,
  Clock,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

const categoryColors: Record<string, string> = {
  "Getting Started": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  Studio: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  Tools: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  "Job Search": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  Networking: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  Recruiters: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
};

const thumbnailGradients = [
  "from-green-500 to-emerald-600",
  "from-violet-500 to-purple-600",
  "from-purple-500 to-fuchsia-600",
  "from-blue-500 to-cyan-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-pink-500 to-rose-600",
  "from-indigo-500 to-violet-600",
];

interface Tutorial {
  title: string;
  description: string;
  duration: string;
  category: string;
  icon: React.ElementType;
}

const tutorials: Tutorial[] = [
  {
    title: "Creating Your Account",
    description:
      "Walk through the sign-up process and initial profile setup.",
    duration: "2 min",
    category: "Getting Started",
    icon: UserPlus,
  },
  {
    title: "Recording Your First Video Resume",
    description:
      "Learn how to use the Studio to record and edit your video resume.",
    duration: "5 min",
    category: "Getting Started",
    icon: Video,
  },
  {
    title: "Using AI Text-to-Speech",
    description:
      "Add professional AI voiceover to your video resume with our TTS engines.",
    duration: "3 min",
    category: "Studio",
    icon: Mic,
  },
  {
    title: "Optimizing Your Resume with AI",
    description:
      "Use the Resume Optimizer and Resume Tailor to boost your resume.",
    duration: "4 min",
    category: "Tools",
    icon: FileSearch,
  },
  {
    title: "Setting Up Job Alerts",
    description:
      "Configure smart notifications to never miss a matching opportunity.",
    duration: "2 min",
    category: "Job Search",
    icon: Bell,
  },
  {
    title: "Practicing for Interviews",
    description:
      "Use the AI Interview Coach to rehearse and improve your responses.",
    duration: "6 min",
    category: "Tools",
    icon: MessageSquare,
  },
  {
    title: "Using the Outreach Feature",
    description:
      "Manage professional networking and follow-ups systematically.",
    duration: "3 min",
    category: "Networking",
    icon: Mail,
  },
  {
    title: "For Recruiters: Posting Jobs",
    description:
      "How to create compelling job listings and manage applications.",
    duration: "4 min",
    category: "Recruiters",
    icon: Briefcase,
  },
];

export default function Tutorials() {
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
    { name: "Video Tutorials", url: "/guides/tutorials" },
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
                Video Tutorials
              </h1>
              <p className="text-muted-foreground mt-2">
                Short, focused walkthroughs to help you get the most out of
                hired.video. Watch at your own pace and start building your
                career presence today.
              </p>
            </div>

            {/* Tutorial cards grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {tutorials.map((tutorial, index) => {
                const Icon = tutorial.icon;
                const gradient = thumbnailGradients[index % thumbnailGradients.length];
                const categoryColor =
                  categoryColors[tutorial.category] ?? "bg-muted text-muted-foreground";

                return (
                  <Card
                    key={tutorial.title}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    {/* Video thumbnail placeholder */}
                    <div
                      className={`relative flex items-center justify-center h-40 bg-gradient-to-br ${gradient}`}
                    >
                      <Icon className="absolute top-4 left-4 h-6 w-6 text-white/60" />
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30">
                        <Play className="h-7 w-7 text-white fill-white" />
                      </div>
                      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
                        <Clock className="h-3 w-3" />
                        {tutorial.duration}
                      </div>
                    </div>

                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={categoryColor}
                        >
                          {tutorial.category}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">
                        {tutorial.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm">
                        {tutorial.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Bottom spacer */}
            <div className="pb-8" />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
