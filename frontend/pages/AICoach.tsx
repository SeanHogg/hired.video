import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Brain, MessageSquare, Sparkles, Users, FileText, Briefcase } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAI } from "@/lib/ai-context";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { AppShell } from "@/components/AppShell";
import AuthOverlay from "@/components/AuthOverlay";
import AIChatPanel from "@/components/AIChatPanel";
import FloatingAIButton from "@/components/FloatingAIButton";
import { ToolIconTile, ToolTitleBlock } from "@/components/tools/ToolTitleBlock";
import MonoChip from "@/components/templates/MonoChip";
import { getCatalogTool } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";
import { createGeneralContext } from "@/lib/utils/ai-context-helpers";

const COACHING_FEATURES = [
  { icon: MessageSquare, key: "interview" },
  { icon: FileText, key: "resume" },
  { icon: Briefcase, key: "career" },
  { icon: Users, key: "networking" },
] as const;

const QUICK_START_PROMPT_KEYS = [
  "aiCoach.prompts.0",
  "aiCoach.prompts.1",
  "aiCoach.prompts.2",
  "aiCoach.prompts.3",
  "aiCoach.prompts.4",
  "aiCoach.prompts.5",
] as const;

const HOW_IT_WORKS_STEPS = ["1", "2", "3"] as const;

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
  useBreadcrumbs([{ name: t("aiCoach.breadcrumb"), url: "/ai-coach" }]);

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

  return (
    <AppShell bgClassName="bg-background">
      <div className={showAuthOverlay ? "relative" : ""}>
        {showAuthOverlay && (
          <AuthOverlay
            contentType="ai-coach"
            title={t("aiCoach.overlay.title")}
            message={t("aiCoach.overlay.message")}
          />
        )}

        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
          <ToolTitleBlock
            icon={<Brain />}
            chips={<MonoChip>{t("aiCoach.chip")}</MonoChip>}
            title={t("aiCoach.title")}
            description={
              <>
                <p>{t("aiCoach.subtitle")}</p>
                {isAuthenticated && (
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      {isAIChatOpen ? t("aiCoach.chatStatus.open") : t("aiCoach.chatStatus.available")}
                    </span>
                  </p>
                )}
              </>
            }
          />

          {/* Featured tools — kept DRY across Profile Audit, Interview
              Questions, and any future "primary AI-Coach handoff" entry
              by mapping over the catalog refs. */}
          {[profileAuditTool, interviewQuestionsTool]
            .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
            .map((tool) => (
              <article
                key={tool.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] border border-border bg-card p-5 sm:p-6"
              >
                <div className="flex min-w-0 flex-[1_1_320px] items-start gap-4">
                  <ToolIconTile>
                    <tool.icon />
                  </ToolIconTile>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-bold tracking-tight">{tool.title}</h2>
                      {tool.statusBadge && <MonoChip>{tool.statusBadge.label}</MonoChip>}
                    </div>
                    <p className="text-base leading-relaxed text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
                <Button asChild className="min-h-[44px] w-full gap-2 sm:w-auto">
                  <Link to={tool.href}>
                    {tool.ctaLabel ?? t("tools.openNamed", { name: tool.title })}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </article>
            ))}

          {/* Features Grid */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {COACHING_FEATURES.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6"
              >
                <ToolIconTile size="md">
                  <Icon />
                </ToolIconTile>
                <MonoChip className="w-fit">{t(`aiCoach.features.${key}.badge`)}</MonoChip>
                <h3 className="text-lg font-semibold leading-snug">{t(`aiCoach.features.${key}.title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`aiCoach.features.${key}.description`)}
                </p>
              </div>
            ))}
          </div>

          {/* Quick Start Section — visible to anon users so they can pick
              a prompt before signing in; clicking gates and snapshots
              the prompt so it auto-sends after authentication. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
                {t("aiCoach.quickStart.title")}
              </CardTitle>
              <CardDescription>{t("aiCoach.quickStart.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {QUICK_START_PROMPT_KEYS.map((key) => {
                  const prompt = t(key);
                  return (
                    <Button
                      key={key}
                      variant="outline"
                      className="h-auto min-h-[44px] justify-start whitespace-normal p-4 text-left"
                      onClick={() => handlePromptClick(prompt)}
                    >
                      <MessageSquare className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="text-sm">{prompt}</span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle>{t("aiCoach.howItWorks.title")}</CardTitle>
              <CardDescription>{t("aiCoach.howItWorks.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
                {HOW_IT_WORKS_STEPS.map((step) => (
                  <li key={step} className="flex flex-col gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent font-mono text-lg font-semibold text-primary"
                    >
                      {step}
                    </span>
                    <h3 className="font-semibold">{t(`aiCoach.howItWorks.step${step}.title`)}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(`aiCoach.howItWorks.step${step}.body`)}
                    </p>
                  </li>
                ))}
              </ol>
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
