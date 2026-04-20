import {
  Briefcase,
  Play,
  Sparkles,
  ArrowRight,
  Brain,
  Users,
  BarChart3,
  FileText,
} from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import FeaturedTools from "@/components/FeaturedTools";
import Footer from "@/components/Footer";
import LatestGuides from "@/components/LatestGuides";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import UnifiedSearch from "@/components/UnifiedSearch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import TemplateGallery from "@/components/resume-renderer/TemplateGallery";
import VideoCard from "@/components/VideoCard";
import HeroVideoSpotlight from "@/components/HeroVideoSpotlight";
import { useSidebar } from "@/hooks/use-sidebar";
import { studioService, type PublicVideo } from "@/lib/services/studio-service";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();

  useSEO(location.pathname);

  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const [chroQuery, setChroQuery] = useState("");
  const [publicVideos, setPublicVideos] = useState<PublicVideo[]>([]);

  React.useEffect(() => {
    studioService
      .getPublicVideos()
      .then((res) => setPublicVideos(res.data ?? []))
      .catch(() => {});
  }, []);

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

        <h1 className="sr-only">
          hired.video — Your AI Chief Human Resources Officer
        </h1>

        {/* AI CHRO Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 pt-20 pb-10 px-4 sm:px-6 lg:px-8 border-b border-border">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[400px] w-[800px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative max-w-6xl mx-auto grid lg:grid-cols-5 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-3 text-center lg:text-left">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
                Your AI CHRO, <span className="text-primary">always on.</span>
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg mb-6 max-w-xl mx-auto lg:mx-0">
                Hire smarter, grow your career, and manage talent — powered by
                an AI that thinks like your best HR leader.
              </p>

              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-8">
                <Brain className="w-3.5 h-3.5" />
                AI Chief Human Resources Officer
              </div>

              <div className="relative bg-card border border-border rounded-2xl shadow-lg p-3">
                <Textarea
                  value={chroQuery}
                  onChange={(e) => setChroQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && chroQuery.trim()) {
                      e.preventDefault();
                      navigate(
                        `/ai-coach?q=${encodeURIComponent(chroQuery.trim())}`,
                      );
                    }
                  }}
                  placeholder={`Ask your AI CHRO anything… "Help me write a job description for a senior engineer" or "What skills should I add to my resume?"`}
                  className="min-h-[80px] resize-none border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                />
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Press Enter to ask · Shift+Enter for new line
                  </p>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={!chroQuery.trim()}
                    onClick={() => {
                      if (chroQuery.trim()) {
                        navigate(
                          `/ai-coach?q=${encodeURIComponent(chroQuery.trim())}`,
                        );
                      }
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Ask CHRO
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center lg:justify-start mt-5">
                {[
                  {
                    icon: FileText,
                    label: "Optimize my resume",
                    q: "Help me optimize my resume for ATS and improve my chances of getting noticed",
                  },
                  {
                    icon: Briefcase,
                    label: "Write a job description",
                    q: "Write a compelling job description for a role I need to fill",
                  },
                  {
                    icon: Users,
                    label: "Source candidates",
                    q: "Help me source and evaluate candidates for an open position",
                  },
                  {
                    icon: BarChart3,
                    label: "Salary benchmarking",
                    q: "What is the market salary range for this role and location?",
                  },
                  {
                    icon: Brain,
                    label: "Interview prep",
                    q: "Help me prepare for my upcoming job interview",
                  },
                ].map(({ icon: Icon, label, q }) => (
                  <button
                    key={label}
                    onClick={() =>
                      navigate(`/ai-coach?q=${encodeURIComponent(q)}`)
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-muted hover:border-primary/40 transition-colors px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    {label}
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              <HeroVideoSpotlight videos={publicVideos} />
            </div>
          </div>
        </section>

        {/* Unified search control + results grid */}
        <UnifiedSearch />

        {/* Resume Templates Section */}
        <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
          <div className="max-w-7xl mx-auto">
            <TemplateGallery />
          </div>
        </section>

        {/* Public Video Resumes Section */}
        {publicVideos.length > 0 && (
          <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-2 mb-6">
                <Play className="w-5 h-5 text-primary" />
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                  Video Resumes
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {publicVideos.map((v) => (
                  <VideoCard
                    key={v.id}
                    id={v.id}
                    title={v.title}
                    description={
                      v.description ?? `${v.ownerName}'s video resume`
                    }
                    thumbnail={v.thumbnailUrl ?? ""}
                    duration=""
                    views={0}
                    type="resume"
                    profession={v.ownerName}
                    company="hired.video"
                    createdAt={v.createdAt}
                    onView={() => navigate(`/v/${v.id}`)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        <FeaturedTools />

        <LatestGuides />

        <Footer />
      </div>
    </div>
  );
}
