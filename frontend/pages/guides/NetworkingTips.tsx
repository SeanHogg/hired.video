import {
  ArrowLeft,
  ArrowRight,
  UserCircle,
  Search,
  MessageSquare,
  PlayCircle,
  Building2,
  Send,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

const tips = [
  {
    title: "Build a Complete Profile",
    icon: UserCircle,
    content:
      "Your profile is your first impression. A complete profile with a video resume gets 5x more views than text-only. Fill in your headline, summary, experience, and skills so recruiters and hiring managers can quickly understand what you bring to the table.",
  },
  {
    title: "Use the People Search",
    icon: Search,
    content:
      "Browse professionals by industry, skills, and location. Save searches to get notified about new matches. This is the fastest way to find decision-makers at companies you're targeting and connect with peers in your field.",
  },
  {
    title: "Send Personalized Messages",
    icon: MessageSquare,
    content:
      "Use the messaging feature to reach out. Mention something specific about their work — a project, a post, or a shared connection. Keep it brief and professional; a concise, thoughtful message stands out far more than a generic template.",
  },
  {
    title: "Engage with Video Resumes",
    icon: PlayCircle,
    content:
      "Watch and provide feedback on others' video resumes. Engagement builds relationships and visibility across the platform. When you leave thoughtful comments, creators notice — and that goodwill often leads to introductions and referrals.",
  },
  {
    title: "Follow Companies",
    icon: Building2,
    content:
      "Stay updated on companies you're interested in. Get notified about new job postings and company updates. Following a company also signals your interest to their recruiters, making you more likely to appear in their candidate searches.",
  },
  {
    title: "Leverage Your Outreach Tools",
    icon: Send,
    content:
      "Use the Outreach feature to manage and track your professional connections and follow-ups systematically. Set reminders, log interactions, and keep notes so no opportunity slips through the cracks as your network grows.",
  },
];

export default function NetworkingTips() {
  const location = useLocation();  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Help & Support", url: "/help" },
    { name: "Networking Tips", url: "/guides/networking" },
  ]);
  const { isAuthenticated } = useAuth();

  return (
    <AppShell bgClassName="bg-background">
<div className="p-6">
          <div className="space-y-8">
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
                Networking Tips
              </h1>
              <p className="text-muted-foreground mt-2">
                Building meaningful professional connections is one of the most
                effective ways to advance your career. Use these strategies to
                grow your network on hired.video and unlock new opportunities.
              </p>
            </div>

            {/* Tip cards */}
            {tips.map((tip) => {
              const Icon = tip.icon;
              return (
                <Card key={tip.title}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                      {tip.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {tip.content}
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            {/* Previous / Next navigation */}
            <div className="flex justify-between pt-4 pb-8">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/guides/video-best-practices">
                  <ArrowLeft className="h-4 w-4" /> Previous: Video Resume
                  Best Practices
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link to="/guides/job-search">
                  Next: Job Search Strategies{" "}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
</AppShell>
  );
}
