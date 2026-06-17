import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Brain, MessageSquare, Sparkles, Users, FileText, Briefcase } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAI } from "@/lib/ai-context";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { AppShell } from "@/components/AppShell";
import AuthOverlay from "@/components/AuthOverlay";
import AIChatPanel from "@/components/AIChatPanel";
import FloatingAIButton from "@/components/FloatingAIButton";
import { getCatalogTool } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";
import { createGeneralContext } from "@/lib/utils/ai-context-helpers";

export default function AICoach() {
  const location = useLocation();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { openAIChat, openAIWithMessage, openAIWithPageContextAndMessage, isAIChatOpen } = useAI();
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Snapshot the prompt the visitor clicked so it auto-sends after login.
  const { restored, snapshot, clear } = usePendingToolInput<{ prompt: string }>();

  // SEO for AI Coach page — meta resolves from the central PAGE_SEO
  // registry entry for /ai-coach (gap #1968).
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "AI Career Coach", url: "/ai-coach" }]);

  // Auto-open AI chat when page loads; pre-fill from ?q= param if present,
  // or from a saved prompt the visitor picked before signing in.
  useEffect(() => {
    if (!isAuthenticated || isAIChatOpen) return;
    const initialQuery = restored?.prompt ?? searchParams.get("q");
    // #971 — durable hand-off priming (target role / seniority / style /
    // source) arrives on `ctx` and is pinned in the system prompt so it
    // survives history compaction, instead of riding the first user
    // message that gets sliced off after a few turns.
    const coachPriming = searchParams.get("ctx") ?? undefined;
    setTimeout(() => {
      if (initialQuery && coachPriming) {
        openAIWithPageContextAndMessage(
          { ...createGeneralContext(), coachPriming },
          initialQuery,
        );
        if (restored?.prompt) clear();
      } else if (initialQuery) {
        openAIWithMessage(initialQuery);
        if (restored?.prompt) clear();
      } else {
        openAIChat();
      }
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handlePromptClick = (prompt: string) => {
    if (!isAuthenticated) {
      snapshot({ prompt });
      setShowAuthOverlay(true);
      return;
    }
    openAIWithMessage(prompt);
  };

  const profileAuditRaw = getCatalogTool("profile-audit");
  const interviewQuestionsRaw = getCatalogTool("interview-questions");
  const profileAuditTool = profileAuditRaw
    ? localizeTool(profileAuditRaw, t)
    : undefined;
  const interviewQuestionsTool = interviewQuestionsRaw
    ? localizeTool(interviewQuestionsRaw, t)
    : undefined;

  const coachingFeatures = [
    {
      icon: MessageSquare,
      title: "Interview Practice",
      description: "Practice common interview questions with AI feedback",
      badge: "Interactive",
    },
    {
      icon: FileText,
      title: "Resume Review",
      description: "Get personalized feedback on your resume content",
      badge: "AI-Powered",
    },
    {
      icon: Briefcase,
      title: "Career Guidance",
      description: "Receive strategic advice for your career path",
      badge: "Personalized",
    },
    {
      icon: Users,
      title: "Networking Tips",
      description: "Learn effective networking and outreach strategies",
      badge: "Expert",
    },
  ];

  const quickStartPrompts = [
    "Help me prepare for a software engineer interview",
    "Review my resume for ATS optimization",
    "What questions should I ask in an interview?",
    "How can I negotiate my salary effectively?",
    "Give me tips for networking in my industry",
    "Help me write a compelling cover letter",
  ];

  return (
    <AppShell bgClassName="bg-background">
      <div className={showAuthOverlay ? "relative" : ""}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="ai-coach"
              title="AI Career Coach"
              message="Sign in to access your personal AI Career Coach and get expert guidance for interviews, resume optimization, and career advancement."
            />
          )}

          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full flex items-center justify-center">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    AI CHRO
                  </h1>
                  <p className="text-xl text-muted-foreground mt-2">
                    Your Chief Human Resources Officer, powered by AI
                  </p>
                </div>
              </div>

              {isAuthenticated && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <span>AI Chat is {isAIChatOpen ? "open" : "available"} — click the AI button to start</span>
                </div>
              )}
            </div>

            {/* Featured tools — kept DRY across Profile Audit, Interview
                Questions, and any future "primary AI-Coach handoff" entry
                by mapping over the catalog refs. */}
            {[profileAuditTool, interviewQuestionsTool]
              .filter((t): t is NonNullable<typeof t> => Boolean(t))
              .map((tool) => (
                <Card
                  key={tool.id}
                  className="mb-4 border-brand-purple/30 bg-gradient-to-r from-brand-purple/5 to-brand-blue/5"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${tool.iconBgClassName}`}
                        >
                          <tool.icon className={`h-6 w-6 ${tool.iconColorClassName}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-xl">{tool.title}</CardTitle>
                            {tool.statusBadge && (
                              <Badge className={tool.statusBadge.className}>
                                {tool.statusBadge.label}
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-base">
                            {tool.description}
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        asChild
                        className="bg-gradient-to-r from-brand-purple to-brand-blue text-white"
                      >
                        <Link to={tool.href}>
                          {tool.ctaLabel ?? `Open ${tool.title}`}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {coachingFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="w-12 h-12 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Icon className="h-6 w-6 text-brand-purple" />
                      </div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <Badge variant="secondary" className="w-fit mx-auto">
                        {feature.badge}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Quick Start Section — visible to anon users so they can pick
                a prompt before signing in; clicking gates and snapshots
                the prompt so it auto-sends after authentication. */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Quick Start Prompts
                </CardTitle>
                <CardDescription>
                  Click any prompt below to start a conversation with your AI Coach
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {quickStartPrompts.map((prompt, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="text-left justify-start h-auto p-4 whitespace-normal"
                      onClick={() => handlePromptClick(prompt)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{prompt}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* How It Works */}
            <Card>
              <CardHeader>
                <CardTitle>How Your AI Career Coach Works</CardTitle>
                <CardDescription>
                  Get personalized career guidance powered by advanced AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl font-bold text-brand-blue">1</span>
                    </div>
                    <h3 className="font-semibold mb-2">Ask Questions</h3>
                    <p className="text-sm text-muted-foreground">
                      Start a conversation about your career goals, interview prep, or resume optimization
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl font-bold text-brand-purple">2</span>
                    </div>
                    <h3 className="font-semibold mb-2">Get AI Insights</h3>
                    <p className="text-sm text-muted-foreground">
                      Receive personalized advice based on your profile, industry, and career stage
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl font-bold text-green-600">3</span>
                    </div>
                    <h3 className="font-semibold mb-2">Take Action</h3>
                    <p className="text-sm text-muted-foreground">
                      Apply the recommendations to advance your career and achieve your goals
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
      </div>

      {/* AI Components - Always available */}
      <FloatingAIButton />
      <AIChatPanel />
    </AppShell>
  );
}
