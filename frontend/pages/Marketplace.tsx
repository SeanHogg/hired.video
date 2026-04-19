import { FileText, Film, Mic, ShoppingBag, Sparkles, Store } from "lucide-react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";

interface Category {
  id: string;
  title: string;
  description: string;
  icon: typeof FileText;
  href: string;
  cta: string;
  badge?: string;
}

const CATEGORIES: Category[] = [
  {
    id: "resume-templates",
    title: "Resume Templates",
    description:
      "Industry-specific, recruiter-vetted resume templates. Preview on any resume before applying. Creators earn when you purchase.",
    icon: FileText,
    href: "/resumes",
    cta: "Browse Templates",
  },
  {
    id: "video-templates",
    title: "AI Video Resume Templates",
    description:
      "Ready-made storyboards for video resumes, job ads, personal brand, and recruiter outreach. One click applies the full scene script.",
    icon: Film,
    href: "/studio",
    cta: "Browse Video Templates",
  },
  {
    id: "voice-marketplace",
    title: "Voice Marketplace",
    description:
      "Licensed voice clones for narrating your video resume. 80/20 creator/platform split. Synthesis runs in your browser — no API keys, no per-call cost.",
    icon: Mic,
    href: "/studio?tab=voice",
    cta: "Browse Voices",
    badge: "Creator earnings",
  },
  {
    id: "services",
    title: "Creator Services",
    description:
      "Coaching, resume reviews, mock interviews, and other career services offered by members of the hired.video community.",
    icon: ShoppingBag,
    href: "/services",
    cta: "Browse Services",
  },
];

export default function Marketplace() {
  const { sidebarOpen, openSidebar, closeSidebar, sidebarCollapsed, toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <main className="pt-16">
          <section className="border-b bg-muted/30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
              <div className="flex items-center gap-2 mb-3">
                <Store className="w-5 h-5 text-primary" />
                <Badge variant="secondary">Marketplace</Badge>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-3">Generate & Get Paid</h1>
              <p className="text-muted-foreground max-w-2xl">
                Browse templates, voices, and services from creators on hired.video — or publish your own and earn. Every asset plugs into the resume and studio tools you already use.
              </p>
              <div className="flex flex-wrap gap-2 mt-6">
                <Link to="/studio">
                  <Button>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Become a Creator
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button variant="outline">See Creator Split</Button>
                </Link>
              </div>
            </div>
          </section>

          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Card key={cat.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="rounded-md bg-primary/10 p-2">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <CardTitle>{cat.title}</CardTitle>
                        </div>
                        {cat.badge && <Badge variant="outline">{cat.badge}</Badge>}
                      </div>
                      <CardDescription className="pt-2">{cat.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <Link to={cat.href}>
                        <Button variant="secondary" className="w-full">
                          {cat.cta}
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
