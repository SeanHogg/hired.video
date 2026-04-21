import { FileText, Film, Mic, Newspaper, ShoppingBag, Sparkles, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      "Industry-specific, recruiter-vetted resume templates. Preview on any resume before applying. Creators keep 95% of every sale.",
    icon: FileText,
    href: "/search?category=templates",
    cta: "Browse Templates",
    badge: "Creator earnings",
  },
  {
    id: "video-templates",
    title: "AI Video Resume Templates",
    description:
      "Ready-made storyboards for video resumes, job ads, personal brand, and recruiter outreach. One click applies the full scene script. Creators keep 95%.",
    icon: Film,
    href: "/studio",
    cta: "Browse Video Templates",
    badge: "Creator earnings",
  },
  {
    id: "voice-marketplace",
    title: "Voice Marketplace",
    description:
      "Licensed voice clones for narrating your video resume. Creators keep 95% of every sale. Synthesis runs in your browser — no API keys, no per-call cost.",
    icon: Mic,
    href: "/search?category=voices",
    cta: "Browse Voices",
    badge: "Creator earnings",
  },
  {
    id: "services",
    title: "Creator Services",
    description:
      "Custom resume videos, coaching, resume reviews, mock interviews, and other career services from the hired.video community. Creators keep 95%.",
    icon: ShoppingBag,
    href: "/services",
    cta: "Browse Services",
    badge: "Creator earnings",
  },
  {
    id: "articles",
    title: "Articles & Writing",
    description:
      "Publish career articles, technical guides, and industry insight. Earn from reader engagement — longer read-time and paying-member reach pay more. Promote your best work to the top of the feed.",
    icon: Newspaper,
    href: "/search?category=articles",
    cta: "Browse Articles",
    badge: "Engagement earnings",
  },
];

export default function MarketplaceHero() {
  return (
    <>
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
    </>
  );
}
