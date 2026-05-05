import {
  Wrench,
  ArrowRight,
  Star,
  Brain,
  FileText,
  BarChart3,
  Play,
  TrendingUp,
  Heart,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { ToolCard } from "@/components/ToolCard";
import { TOOLS_CATALOG, type ToolTier } from "@/data/tools-catalog";
import { useHeaderFilters } from "@/lib/header-filters";

type TierFilter = "all" | ToolTier;

const TIER_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Paid" },
];

export default function Tools() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  // SEO for tools page
  useSEO(location.pathname);

  const [searchParams] = useSearchParams();
  const toolQuery = searchParams.get("q") ?? "";
  const tierParam = searchParams.get("tier") ?? "";
  const tierFilter: TierFilter =
    tierParam === "free" || tierParam === "pro" ? tierParam : "all";

  useHeaderFilters([
    {
      key: "tier",
      label: "Tier",
      type: "select",
      options: TIER_OPTIONS,
    },
  ]);

  const filteredTools = useMemo(() => {
    const q = toolQuery.trim().toLowerCase();
    return TOOLS_CATALOG.filter((tool) => {
      if (tierFilter !== "all" && tool.tier !== tierFilter) return false;
      if (q === "") return true;
      const haystack =
        `${tool.title} ${tool.description} ${tool.features?.join(" ") ?? ""} ${tool.statusBadge?.label ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [toolQuery, tierFilter]);

  const isFiltering = toolQuery.trim() !== "" || tierFilter !== "all";

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <AppShell>
        <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <Wrench className="h-12 w-12 text-primary" />
                    <Brain className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    AI-Powered Tools
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Supercharge Your Career with Smart Tools
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Access cutting-edge AI tools designed to optimize your resume,
                  practice interviews, calculate salary expectations, and
                  accelerate your career growth.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Access All Tools
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Play className="mr-2 h-5 w-5" />
                    Try Free Tool
                  </Button>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">10+</div>
                  <p className="text-sm text-muted-foreground">
                    AI-powered tools
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    1M+
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Resumes analyzed
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    95%
                  </div>
                  <p className="text-sm text-muted-foreground">Accuracy rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    24/7
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tool availability
                  </p>
                </div>
              </div>

              {/* Unified Tools Grid */}
              <div className="mb-12 sm:mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
                  AI-Powered Career Tools
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {TOOLS_CATALOG.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              </div>

          {/* How It Works */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12">
              How Our AI Tools Work
            </h2>
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">1. Upload Content</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your resume, job description, or input
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">2. AI Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Our AI processes and analyzes your content
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">3. Get Insights</h3>
                <p className="text-sm text-muted-foreground">
                  Receive detailed feedback and recommendations
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">4. Improve & Succeed</h3>
                <p className="text-sm text-muted-foreground">
                  Apply insights to enhance your career
                </p>
              </div>
            </div>
          </div>

          {/* Feature Spotlight - Sentiment Analysis */}
          <div className="mb-16">
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-100">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-8 w-8 text-pink-600" />
                </div>
                <h2 className="text-3xl font-bold mb-4">
                  New: Resume Sentiment Analysis
                </h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Discover how positive your resume sounds to employers with our
                  AI-powered sentiment analysis tool
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-pink-600 mb-2">
                    85%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Analysis Accuracy
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    40%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    More Interview Invites
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    0-100
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sentiment Score Range
                  </p>
                </div>
              </div>

              <div className="text-center">
                <Link to="/Tools/SentimentAnalysis">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90"
                  >
                    <Heart className="mr-2 h-5 w-5" />
                    Try Sentiment Analysis Free
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Success Stories */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-center mb-12">
              Tool Success Stories
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm mb-4">
                    "The Resume Optimizer helped me increase my callback rate by
                    300%. The AI suggestions were spot-on and helped me tailor
                    my resume for each application."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Jennifer Liu</p>
                      <p className="text-xs text-muted-foreground">
                        Data Analyst
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm mb-4">
                    "The Interview Simulator gave me the confidence I needed. I
                    practiced for weeks and nailed my dream job interview. The
                    feedback was incredibly detailed."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Carlos Martinez</p>
                      <p className="text-xs text-muted-foreground">
                        Software Engineer
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <p className="text-sm mb-4">
                    "I never realized my resume sounded so negative! The
                    sentiment analysis showed me exactly what to change. After
                    improving my score from 35 to 78, I started getting way more
                    interview calls."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full" />
                    <div>
                      <p className="font-medium text-sm">Sarah Chen</p>
                      <p className="text-xs text-muted-foreground">
                        Marketing Manager
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
            <h3 className="text-2xl font-bold mb-4">
              Ready to Enhance Your Career?
            </h3>
            <p className="text-muted-foreground mb-6">
              Access our AI-powered tools and take your career to the next
              level. More tools coming soon!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Get Started Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/Tools/SentimentAnalysis">
                <Button size="lg" variant="outline">
                  Try Sentiment Analysis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // If user is authenticated, show the actual tools page
  return (
    <AppShell bgClassName="bg-background">
      <div className="p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <PageHeader
              tabs={[{ key: "tools", label: "Tools", icon: Wrench, to: "/tools" }]}
              activeTabKey="tools"
              title="AI-Powered Career Tools"
              description="Access powerful AI tools to enhance your career and optimize your job search."
            />

            {isFiltering && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  {filteredTools.length} tool
                  {filteredTools.length === 1 ? "" : "s"}
                  {toolQuery.trim() !== "" && (
                    <>
                      {" "}match
                      {filteredTools.length === 1 ? "es" : ""}{" "}
                      <span className="font-medium text-foreground">
                        &quot;{toolQuery}&quot;
                      </span>
                    </>
                  )}
                  {tierFilter !== "all" && (
                    <>
                      {" "}in{" "}
                      <span className="font-medium text-foreground">
                        {tierFilter === "free" ? "Free" : "Paid"}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Unified Tools Grid */}
            <div className="mb-8 sm:mb-12">
              {filteredTools.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
                  <p>No tools match the current filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
    </AppShell>
  );
}

