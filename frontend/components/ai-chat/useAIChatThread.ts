/**
 * useAIChatThread — the ONE chat-thread implementation (state, help-first
 * deflection, tool-call loop, session history) shared by every AI chat
 * surface: the global <AIChatPanel/> slide-over and embedded threads such
 * as the Studio editor's AI tab. Surfaces own only their chrome; the
 * conversation logic lives here so the two can never drift.
 *
 * Studio tools (studio_*) reach the open editor through the editor bridge
 * (`registerStudioEditor`), so an embedded thread mounted inside the editor
 * drives that editor with no extra wiring.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { FileText, Briefcase, BarChart3, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAI } from "@/lib/ai-context";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { aiService, type ChatMessage } from "@/lib/services/ai-service";
import { helpService } from "@/lib/services/help-service";
import { getCoachToolSpecs, getTool, buildGenerateImageResult } from "@/lib/tools/registry";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { AIUsageLimitError, RateLimitError } from "@/lib/errors";
import { TIER_COPY } from "@shared/tier-copy";
import { useAiLabels } from "@/lib/utils/use-ai-labels";
import { detectContextType } from "@/lib/config/page-meta-registry";
import { useContextHelpItems } from "@/lib/help/use-context-help-items";
import { useTokenBudget } from "@/hooks/use-token-budget";
import type { AIAction } from "@/lib/types/ai-context";
import {
  type ChatThreadMessage,
  createContextForType,
  createEnhancedSystemPrompt,
  getConversationalPrompt,
  resolveActiveResumeId,
} from "./chat-prompts";
import { useChatSessions } from "./useChatSessions";

export interface ChatRateLimit {
  message: string;
  upgradeUrl?: string;
  used?: number;
  limit?: number;
  remaining?: number;
}

export interface QuickSuggestion {
  text: string;
  icon: LucideIcon;
  action: AIAction;
}

export interface UseAIChatThreadOptions {
  /** True while the surface is visible — drives usage refresh + help catalog load. */
  active: boolean;
  /** Auto-send `pendingMessage` from the AI context when it arrives (global panel only). */
  consumePendingMessage?: boolean;
  /** Resolve the route → page context (once per app is enough; the global panel does it). */
  syncRouteContext?: boolean;
}

function iconForAction(action: string): LucideIcon {
  if (action.includes("resume") || action.includes("optimize") || action.includes("improve")) return FileText;
  if (action.includes("job") || action.includes("match")) return Briefcase;
  if (action.includes("analyze") || action.includes("score")) return BarChart3;
  return Sparkles;
}

export function useAIChatThread({
  active,
  consumePendingMessage = false,
  syncRouteContext = false,
}: UseAIChatThreadOptions) {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { pageContext, setPageContext, pendingMessage, clearPendingMessage, getFormSnapshot } = useAI();
  const { actionLabel } = useAiLabels();
  const activeResumeId = resolveActiveResumeId(location.pathname, pageContext);
  const contextHelp = useContextHelpItems(detectContextType(location.pathname), active);
  const tokenBudget = useTokenBudget();

  const getWelcomeMessage = useCallback((): string => {
    if (!isAuthenticated || !user) {
      return t("aiChat.welcome.anonymous", "👋 Hi! I'm your AI CHRO — Chief Human Resources Officer. Whether you're searching for your next role, sourcing top talent, or building a team, I'm here to guide you. What can I help you with?");
    }
    const roleMessages: Record<string, string> = {
      [USER_ROLES.JOB_SEEKER]: t("aiChat.welcome.jobSeeker", "👋 Hi! I'm your AI CHRO. I can help you craft a standout resume, ace your interviews, negotiate your salary, and land the role you deserve. What are we working on today?"),
      [USER_ROLES.RECRUITER]: t("aiChat.welcome.recruiter", "👋 Hi! I'm your AI CHRO. I can help you source top candidates, write compelling job descriptions, run structured interviews, and close faster. What's on your hiring agenda?"),
      [USER_ROLES.EMPLOYER]: t("aiChat.welcome.employer", "👋 Hi! I'm your AI CHRO. I can help you build high-performing teams, optimize your hiring process, benchmark compensation, and manage your workforce strategy. Where do you want to start?"),
      [USER_ROLES.ADMIN]: t("aiChat.welcome.admin", "👋 Hi! I'm your AI CHRO. I can help you manage the platform, analyze user metrics, and drive better outcomes across the board. What do you need?"),
      [USER_ROLES.SUPER_ADMIN]: t("aiChat.welcome.superAdmin", "👋 Hi! I'm your AI CHRO. Full platform visibility is at your fingertips — analytics, user management, system insights. What are we looking at?"),
    };
    return roleMessages[user.role] || roleMessages[USER_ROLES.JOB_SEEKER];
  }, [isAuthenticated, user, t]);

  const welcome = useCallback(
    (): ChatThreadMessage => ({ id: "welcome", content: getWelcomeMessage(), sender: "ai", timestamp: new Date() }),
    [getWelcomeMessage],
  );

  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [rateLimitError, setRateLimitError] = useState<ChatRateLimit | null>(null);

  // Seed (or re-seed on role change) the welcome bubble.
  useEffect(() => {
    if (messages.length === 0) setMessages([welcome()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // Route → contextType resolution lives in the declarative page-context
  // registry (single source of truth, gap #1621).
  useEffect(() => {
    if (!syncRouteContext) return;
    try {
      setPageContext(createContextForType(detectContextType(location.pathname), user?.role));
    } catch (error) {
      console.error("[AIChat] Error detecting/setting context:", error);
      setPageContext(undefined);
    }
  }, [syncRouteContext, location.pathname, user?.role, setPageContext]);

  const appendAi = (content: string, extra?: Partial<ChatThreadMessage>) =>
    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), content, sender: "ai", timestamp: new Date(), ...extra },
    ]);

  const sendMessage = useCallback(async (content: string, action?: AIAction) => {
    if (!content.trim()) return;
    const text = content.trim();
    setMessages((prev) => [...prev, { id: Date.now().toString(), content: text, sender: "user", timestamp: new Date() }]);
    setIsTyping(true);
    setRateLimitError(null);

    // Help-first deflection (#2232): answer plain questions from the bundled
    // help docs via a cheap grounded call BEFORE spending a premium chat turn.
    if (!action) {
      try {
        const { searchHelpLocal, helpItemsForSlugs } = await import("@/lib/help/content");
        const candidates = searchHelpLocal(text, i18n.language, 4);
        try {
          const sem = await helpService.search(text);
          if (sem.data?.semantic && sem.data.slugs.length > 0) {
            const seen = new Set(candidates.map((c) => c.slug));
            for (const item of helpItemsForSlugs(sem.data.slugs, i18n.language)) {
              if (!seen.has(item.slug)) {
                candidates.push(item);
                seen.add(item.slug);
              }
            }
          }
        } catch {
          // Semantic unavailable → keyword candidates only.
        }
        if (candidates.length > 0) {
          candidates.length = Math.min(candidates.length, 6);
          const help = await aiService.helpAssist({
            question: text,
            candidates: candidates.map((cd) => ({ slug: cd.slug, title: cd.title, summary: cd.summary, body: cd.body })),
            history: conversationHistory,
          });
          if (!help.escalate && help.answer) {
            const answer = help.answer;
            appendAi(answer);
            setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: answer }]);
            setIsTyping(false);
            return;
          }
        }
      } catch {
        // Any help-path failure silently falls through to the full chat.
      }
    }

    // Anonymous users get help-center answers for free (above); full AI
    // Q&A needs an account — nudge sign-in instead of calling /chat.
    if (!isAuthenticated) {
      appendAi(t("aiChat.anonEscalate", "I can answer questions about using hired.video from our help center for free. For personalised help — resume reviews, job matching, interview prep — sign in to get 10 free AI requests a month."));
      setIsTyping(false);
      return;
    }

    try {
      const userInfo = user
        ? { name: user.name || user.email, role: user.role, plan: tokenBudget.isPro ? "pro" : "free" }
        : undefined;
      // Live authoring-form snapshot read lazily (ref-backed getter) and
      // merged so the prompt sees the in-progress draft (#1621).
      const liveFormSnapshot = getFormSnapshot();
      const activeContext = pageContext
        ? { ...pageContext, formSnapshot: liveFormSnapshot ?? pageContext.formSnapshot }
        : pageContext;
      const systemContent = activeContext
        ? createEnhancedSystemPrompt(activeContext, action, userInfo)
        : `You are the AI CHRO for hired.video — an expert HR advisor helping ${userInfo?.role || "users"} with career, hiring, and workforce decisions. Be concise, actionable, and personalised.${userInfo ? `\n\nUser: ${userInfo.name}, Role: ${userInfo.role}, Plan: ${userInfo.plan}` : ""}`;
      const chatMessages = [
        { role: "system" as const, content: systemContent },
        ...conversationHistory,
        { role: "user" as const, content: text },
      ];
      // The registry is the single tool catalog source; SuperAdmin-only
      // tools surface only for SuperAdmins.
      const toolSpecs = getCoachToolSpecs({ superAdmin: isSuperAdminFromToken() });
      let sessionForTurn: string | undefined = currentSessionId ?? undefined;
      const accumulatedRuns: NonNullable<ChatThreadMessage["toolRuns"]> = [];

      let response = await aiService.sendChatMessage(chatMessages, { sessionId: sessionForTurn, tools: toolSpecs });
      sessionForTurn = response.sessionId ?? sessionForTurn;

      // Tool-call loop: run the model's requested calls locally, post the
      // results back, repeat (capped so a runaway model can't loop forever).
      let safety = 0;
      while (response.toolCalls && response.toolCalls.length > 0 && safety < 4) {
        safety += 1;
        const assistantToolCalls = response.toolCalls;
        const toolResults: Array<{ toolCallId: string; name: string; result: unknown }> = [];
        for (const tc of assistantToolCalls) {
          const tool = getTool(tc.function.name);
          let runResult: NormalizedToolRunResult;
          if (!tool) {
            runResult = { summary: `Unknown tool: ${tc.function.name}` };
          } else {
            try {
              const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
              runResult = await tool.run({ bound: { resumeId: activeResumeId }, args });
            } catch (err) {
              runResult = { summary: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
            }
          }
          accumulatedRuns.push({ toolId: tc.function.name, toolCallId: tc.id, result: runResult });
          // Mutating tools that staged a preview tell the model "awaiting the
          // user's Apply" so it doesn't pretend the edit already landed.
          const llmFacing =
            runResult.mutation?.status === "pending"
              ? { presented: true, awaiting: "user_apply", note: runResult.summary }
              : runResult;
          toolResults.push({ toolCallId: tc.id, name: tc.function.name, result: llmFacing });
        }
        response = await aiService.sendChatMessage(chatMessages, {
          sessionId: sessionForTurn,
          tools: toolSpecs,
          assistantToolCalls,
          toolResults,
        });
        sessionForTurn = response.sessionId ?? sessionForTurn;
      }

      const responseMessage = response.message;
      if (sessionForTurn && sessionForTurn !== currentSessionId) setCurrentSessionId(sessionForTurn);
      setConversationHistory([
        ...conversationHistory,
        { role: "user", content: text },
        { role: "assistant", content: responseMessage },
      ]);
      appendAi(responseMessage, { toolRuns: accumulatedRuns.length > 0 ? accumulatedRuns : undefined });
    } catch (error) {
      console.error("Error in AI chat:", error);
      if (error instanceof AIUsageLimitError || error instanceof RateLimitError) {
        setRateLimitError({
          message: error.message,
          upgradeUrl: error.upgradeUrl,
          used: error.used,
          limit: error.limit,
          remaining: error.remaining,
        });
        appendAi(`⚠️ ${error.message}\n\n${TIER_COPY.upgradeForMoreAiTokens()}`);
      } else {
        appendAi("I'm experiencing a technical issue. Let me try to help you anyway! What would you like to know about resumes, job searching, or recruitment?");
      }
    } finally {
      setIsTyping(false);
      if (isAuthenticated) void tokenBudget.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationHistory, currentSessionId, pageContext, getFormSnapshot, user, tokenBudget, isAuthenticated, activeResumeId]);

  // Auto-send a pending message (e.g. from quick prompts) once visible.
  useEffect(() => {
    if (consumePendingMessage && active && pendingMessage) {
      clearPendingMessage();
      setTimeout(() => void sendMessage(pendingMessage), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumePendingMessage, active, pendingMessage]);

  // Refresh usage when the surface becomes visible.
  useEffect(() => {
    if (active && isAuthenticated) void tokenBudget.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isAuthenticated]);

  const quickSuggestions: QuickSuggestion[] =
    pageContext && pageContext.availableActions.length > 0
      ? pageContext.availableActions.slice(0, 4).map((action: string) => ({
          text: actionLabel(action),
          icon: iconForAction(action),
          action: action as AIAction,
        }))
      : [
          { text: "Optimize my resume", icon: FileText, action: "optimize-content" as AIAction },
          { text: "Find job matches", icon: Briefcase, action: "match-candidates" as AIAction },
          { text: "Recruitment tips", icon: Users, action: "get-help" as AIAction },
          { text: "HR analytics", icon: BarChart3, action: "analyze-performance" as AIAction },
        ];

  const sendSuggestion = (suggestionText: string, action?: AIAction) =>
    void sendMessage(action ? getConversationalPrompt(action) : suggestionText, action);

  const chatSessions = useChatSessions({
    isAuthenticated,
    onLoad: (session) => {
      setCurrentSessionId(session.id);
      setConversationHistory(
        session.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      );
      setMessages(
        session.messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: (m.role === "user" ? "user" : "ai") as "user" | "ai",
          timestamp: new Date(m.createdAt),
        })),
      );
    },
    onDeleted: (sessionId) => {
      if (currentSessionId === sessionId) startNewChat();
    },
  });

  const startNewChat = () => {
    setCurrentSessionId(null);
    setConversationHistory([]);
    setRateLimitError(null);
    setMessages([welcome()]);
    chatSessions.setShowHistory(false);
  };

  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      // silently fail
    }
  };

  /** Patch one tool run's result in place (Apply / Discard outcome). */
  const updateToolRun = (messageId: string, toolCallId: string, result: NormalizedToolRunResult) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, toolRuns: m.toolRuns?.map((r) => (r.toolCallId === toolCallId ? { ...r, result } : r)) }
          : m,
      ),
    );

  /** Surface a locally generated image as the same card the model path renders. */
  const appendGeneratedImage = (imageUrl: string, mode: Parameters<typeof buildGenerateImageResult>[0]["mode"], prompt: string) =>
    setMessages((prev) => [
      ...prev,
      {
        id: `gen-image-${Date.now()}`,
        content: t("aiChat.imageGenerated", "Generated and saved to your library."),
        sender: "ai",
        timestamp: new Date(),
        toolRuns: [
          {
            toolId: "generate_image",
            toolCallId: `local-${Date.now()}`,
            result: buildGenerateImageResult({ imageUrl, mode, prompt }),
          },
        ],
      },
    ]);

  return {
    messages,
    isTyping,
    rateLimitError,
    dismissRateLimit: () => setRateLimitError(null),
    pageContext,
    isAuthenticated,
    quickSuggestions,
    contextHelp,
    sendMessage,
    sendSuggestion,
    startNewChat,
    ...chatSessions,
    currentSessionId,
    copiedMessageId,
    copyMessage,
    updateToolRun,
    appendGeneratedImage,
  };
}

export type AIChatThreadState = ReturnType<typeof useAIChatThread>;
