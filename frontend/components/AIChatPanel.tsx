import {
  X,
  Brain,
  FileText,
  Users,
  Briefcase,
  BarChart3,
  Info,
  Sparkles,
  Code,
  Plus,
  History,
  Copy,
  Check,
  ChevronLeft,
  MessageSquare,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button, Button as UiButton } from "@/components/ui/button";
import { AIInputBox } from "@/components/AIInputBox";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAI } from "@/lib/ai-context";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { type ChatMessage } from "@/lib/services/ai-service";
import { apiClient } from "@/lib/api-client";
import {
  getCoachToolSpecs,
  getTool,
  buildGenerateImageResult,
} from "@/lib/tools/registry";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import { cn } from "@/lib/utils";
import Markdown from "@/components/Markdown";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { AIUsageLimitError, RateLimitError } from "@/lib/errors";
import { useIsMobile } from "@/hooks/use-mobile";
import { aiService } from "@/lib/services/ai-service";
import { TIER_COPY } from "@shared/tier-copy";
import { getPrompt } from "@shared/ai-prompts";
import {
  createDashboardContext,
  createJobContext,
  createResumeContext,
  createProfileContext,
  createSearchContext,
  createTasksContext,
  createGeneralContext
} from "@/lib/utils/ai-context-helpers";
import { useAiLabels } from "@/lib/utils/use-ai-labels";
import type { AIAction, AIContextType, AIContext } from "@/lib/types/ai-context";
import { detectContextType } from "@/lib/config/page-meta-registry";
import { useAIUsage } from "@/hooks/use-ai-usage";
import { AIUsageLimitBanner, AIUsageLimitErrorBanner } from "@/components/AIUsageLimitBanner";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  type?: "text" | "suggestion";
  /** AI tool runs surfaced as inline cards in this bubble. Each card
   *  self-gates its Apply UX based on the user's auto-apply preference. */
  toolRuns?: Array<{
    toolId: string;
    toolCallId: string;
    result: NormalizedToolRunResult;
  }>;
}

/** Resolve which resume the AI tools should run against this turn.
 *
 *  Single rule, two sources:
 *    1. URL path — `/resumes/:id`, `/resumes/edit/:id`, `/resumes/:id/edit`.
 *       Used when the user is viewing/editing a specific resume; binds the
 *       tools without making the LLM pass IDs around.
 *    2. Page context — when a non-resume page (Career 360, Profile Audit,
 *       a tool surface) opens the chat with `<ResumeContext>.resume.id`,
 *       fall through to that. Without this, tools that need resume content
 *       (resume-scorer, summarize, sentiment, …) fail with
 *       "Resume content is too short or empty". */
function resolveActiveResumeId(
  pathname: string,
  pageContext: AIContext | undefined,
): string | undefined {
  const m =
    pathname.match(/^\/resumes\/edit\/([^/?#]+)/) ??
    pathname.match(/^\/resumes\/([^/?#]+)/);
  if (m) {
    const id = m[1];
    if (id !== "new" && id !== "create") return id;
  }
  if (pageContext && pageContext.contextType.startsWith("resume")) {
    const ctx = pageContext as Extract<AIContext, { contextType: `resume-${string}` }>;
    return ctx.resume?.id;
  }
  return undefined;
}

// ============================================================================
// HELPER FUNCTIONS - System Prompt Creation
// ============================================================================

/** Render the live job-posting form snapshot for the system prompt.
 *  Empty / unset values are surfaced explicitly so the LLM knows what's
 *  missing and doesn't ask the user to repeat fields they've already
 *  filled in. */
function formatJobFormSnapshot(job: Record<string, unknown> | undefined): string {
  const fields: Array<{ key: string; label: string }> = [
    { key: "title", label: "Title" },
    { key: "company", label: "Company" },
    { key: "location", label: "Location" },
    { key: "workSetting", label: "Work setting" },
    { key: "employmentType", label: "Employment type" },
    { key: "seniority", label: "Seniority" },
    { key: "description", label: "Description" },
    { key: "responsibilities", label: "Responsibilities" },
    { key: "requirements", label: "Requirements" },
    { key: "salaryMin", label: "Salary min" },
    { key: "salaryMax", label: "Salary max" },
    { key: "currency", label: "Currency" },
  ];
  const lines: string[] = [];
  for (const { key, label } of fields) {
    const value = job?.[key];
    if (value === undefined || value === null || value === "") {
      lines.push(`- ${label}: (empty)`);
    } else if (Array.isArray(value)) {
      lines.push(`- ${label}: ${value.length === 0 ? "(empty)" : value.join(", ")}`);
    } else if (typeof value === "string" && value.length > 240) {
      lines.push(`- ${label}: ${value.slice(0, 240)}…`);
    } else {
      lines.push(`- ${label}: ${String(value)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Create an enhanced system prompt with context, action, and user awareness
 */
function createEnhancedSystemPrompt(
  context: AIContext,
  action?: AIAction,
  userInfo?: { name?: string; role?: string; plan?: string },
): string {
  // Career-coach persona — shared with /api/ai/chat via the registry
  // under `shared/ai-prompts/`. The panel layers tool-use guidance on
  // top because the panel exposes the editing-tool catalog; the bare
  // /api/ai/chat surface does not.
  const basePrompt = `${getPrompt("career-coach").render(userInfo ?? {})}

TOOL USE:
You have access to a catalog of tools — analysis tools (resume scoring, sentiment, job match, skill extraction, etc.) and editing tools (apply_resume_rewrite, update_resume_summary, add_resume_skill, apply_job_draft). Prefer calling a tool over describing what it would do. For mutation tools, call them only after the user has agreed to the specific change you've proposed; the platform shows the user a preview + Apply button per tool call. **Do not paste a markdown template back to the user when an editing tool exists — call the tool.**`;

  // Add context-specific instructions
  let contextInstructions = "";

  if (context.contextType === "tasks") {
    contextInstructions = `

CURRENT CONTEXT: Task Management Page
The user is on the task management page where they can create and manage tasks.

Available APIs:
${context.availableAPIs.map((api) => `- ${api.id}: ${api.description} (${api.endpoint})`).join("\n")}

When helping with tasks:
- For "create-task": Ask for task name/title (REQUIRED), description, start date (REQUIRED), deadline, and priority
- For "prioritize-tasks": Analyze their current tasks and suggest a priority order with reasoning
- For "organize-tasks": Suggest categorization and grouping strategies
- For "break-down-task": Help break complex tasks into smaller, manageable subtasks
- For "suggest-schedule": Create a realistic schedule based on their tasks and deadlines

TASK API REQUIREMENTS:
To create a task via /api/Task/save, you MUST have:
- text (string, REQUIRED): The task title/name
- start (date, REQUIRED): When the task starts
- description (string, optional): Detailed description
- end (date, optional): Deadline/due date
- progress (number 0-100, optional): Current progress
- type (string, optional): Task category/type
- priority (string, optional): Priority level (high/medium/low)

NEVER attempt to create a task without gathering the required fields first!`;
  } else if (context.contextType.startsWith("resume")) {
    contextInstructions = `

CURRENT CONTEXT: Resume ${context.contextType.includes("create") ? "Creation" : context.contextType.includes("edit") ? "Editing" : "Viewing"}
Help the user create a compelling, ATS-optimized resume. Ask about their experience, skills, and target roles before making suggestions.`;
  } else if (context.contextType.startsWith("job")) {
    const isAuthoring =
      context.contextType === "job-create" || context.contextType === "job-edit";
    if (isAuthoring) {
      contextInstructions = `

CURRENT CONTEXT: Job ${context.contextType === "job-create" ? "Creation" : "Editing"}

The user is on the job-posting form. The form's current values are below — fields shown as "(empty)" still need to be filled.

CURRENT FORM VALUES:
${formatJobFormSnapshot(context.formSnapshot)}

WHEN THE USER ASKS YOU TO DRAFT, FILL, IMPROVE, OR REWRITE THE POSTING:
1. Do NOT dump a markdown template into chat. The form is right there — write into it.
2. Call the \`apply_job_draft\` tool with the fields you want to set. Pass only the fields you're changing; omitted fields keep their current value.
3. Use the user's existing values as anchors — if the title is "Senior AI Engineer", do not invent a different title in the description.
4. For multi-field drafts, one \`apply_job_draft\` call is enough — pass every field at once. Do not call the tool repeatedly for each field.
5. Each call stages a preview the user can Apply or Discard. Briefly tell them what's queued and offer next-step refinements (e.g. "Want me to tighten the requirements list?").`;
    } else {
      contextInstructions = `

CURRENT CONTEXT: Job ${context.contextType === "job-view" ? "Viewing" : "List"}
Help the user with job-related tasks. Provide insights on job fit, application strategies, and optimization.`;
    }
  } else if (context.contextType === "dashboard") {
    contextInstructions = `

CURRENT CONTEXT: Dashboard
Provide an overview of their account status, suggest next steps, and help them navigate the platform effectively.`;
  } else if (context.contextType === "studio") {
    contextInstructions = `

CURRENT CONTEXT: Studio video editor
The user has a video open in the Studio editor. You can DRIVE the editor directly through your studio_* tools — don't tell the user to hunt for a button in the side panel.

- "screen record" / "record my screen" / "record a demo" / "record a webcam clip" → call \`studio_start_recording\` (mode: screen | webcam | screen-pip). The browser needs a click to begin capture, so this opens the armed recorder; the finished clip becomes its OWN full-bleed scene, and save & publish stitches the scenes in order (slide → recording → slide).
- "add a [text / image / video / shape / chart / CTA / …]" → call \`studio_insert_widget\`.
- Managing scenes (duplicate / delete / reorder / recolor / switch) → call \`studio_list_scenes\` FIRST to get scene ids, then the matching scene tool.
- "make an image of X and put it in" → call \`generate_image\`, then pass its returned URL to \`studio_add_image\`.
- Screenshot something on screen → \`studio_capture_screenshot\`.

Prefer calling the tool over describing the steps.`;
  }

  // Add action-specific instructions
  let actionInstructions = "";

  if (action) {
    const actionDescriptions: Record<string, string> = {
      "create-task": `

USER INTENT: The user wants to create a new task.

YOUR RESPONSE SHOULD:
1. Acknowledge their request warmly
2. Explain what information you need (task name and start date are required)
3. Ask them to describe the task they want to create
4. Once they provide details, ask for any missing required fields
5. Summarize the task details and ask for confirmation
6. Only after confirmation, call the create-task tool if it is available. If no task tool is exposed in this turn, tell the user the task isn't wired into this surface yet.

Example response:
"I'd be happy to help you create a new task! To get started, I need a few details:

📝 **Required:**
- Task name/title
- Start date

✨ **Optional (but helpful):**
- Description
- Deadline
- Priority level (high/medium/low)

What task would you like to create?"`,

      "prioritize-tasks": `

USER INTENT: The user wants help prioritizing their tasks.

YOUR RESPONSE SHOULD:
1. Ask about their current tasks or goals
2. Inquire about deadlines and importance
3. Provide a prioritization framework (e.g., Eisenhower Matrix)
4. Suggest a specific priority order with reasoning`,

      "break-down-task": `

USER INTENT: The user wants to break down a complex task into smaller steps.

YOUR RESPONSE SHOULD:
1. Ask them to describe the complex task
2. Help identify logical subtasks
3. Suggest a sequence or order
4. Offer to help them create these as separate tasks if they'd like`,
    };

    actionInstructions = actionDescriptions[action] || `

USER INTENT: The user wants help with: ${action.replace(/-/g, " ")}

Engage conversationally to understand their needs and provide helpful guidance.`;
  }

  // #971 — Pin durable hand-off priming (target role / seniority / style /
  // source) into the system prompt so it survives server-side history
  // compaction. Launched-from-a-tool sessions put it here instead of (or in
  // addition to) the first user message, which gets sliced off after a few
  // turns.
  const primingInstructions = context.coachPriming
    ? `

SESSION CONTEXT (persists for the whole conversation — do NOT ask the user to repeat any of this):
${context.coachPriming.trim()}`
    : "";

  return (basePrompt + contextInstructions + primingInstructions + actionInstructions).trim();
}

const BUILDERFORCE_URL = "https://builderforce.ai";

/** Shared footer caption — "Powered by BuilderForce.ai" with the brand as a
 *  new-window hyperlink. Rendered both inline in the input box (`helpText`)
 *  and in the upsell fallback, so it lives in one place. */
function AIFooterCaption() {
  const { t } = useTranslation();
  return (
    <>
      {t("aiChat.poweredByPrefix", "Powered by")}{" "}
      <a
        href={BUILDERFORCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2 hover:text-foreground"
      >
        BuilderForce.ai
      </a>
    </>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIChatPanel() {
  const location = useLocation();
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { isAIChatOpen, closeAIChat, pageContext, setPageContext, pendingMessage, clearPendingMessage, getFormSnapshot } = useAI();
  const isMobile = useIsMobile();
  const isSuperAdmin = isSuperAdminFromToken();
  const { contextLabel, actionLabel } = useAiLabels();
  const activeResumeId = resolveActiveResumeId(location.pathname, pageContext);

  // Get personalized welcome message based on user role
  const getWelcomeMessage = () => {
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
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  // Quick-action AI image popover — cross-studio first-class image
  // gen rollout. Same `MediaAiPromptPanel` the studio surfaces use;
  // opens above the chat input as a popover.
  const [aiImagePromptOpen, setAiImagePromptOpen] = useState(false);

  // Initialize welcome message based on user role
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          content: getWelcomeMessage(),
          sender: "ai",
          timestamp: new Date(),
        },
      ]);
    }
  }, [user?.role]); // Re-initialize if user role changes
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>(
    [],
  );
  const [rateLimitError, setRateLimitError] = useState<{
    message: string;
    upgradeUrl?: string;
    used?: number;
    limit?: number;
    remaining?: number;
  } | null>(null);
  const aiUsage = useAIUsage();
  const [showContextInfo, setShowContextInfo] = useState(false);
  const [useOrchestration, setUseOrchestration] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-send pending message when panel opens (e.g. from quick prompts)
  useEffect(() => {
    if (isAIChatOpen && pendingMessage) {
      clearPendingMessage();
      // Small delay to let the panel render first
      setTimeout(() => {
        handleSendMessage(pendingMessage);
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAIChatOpen, pendingMessage]);

  // Auto-detect and set context based on current route and user role.
  // Route → contextType resolution lives in the declarative
  // page-context registry (single source of truth, gap #1621).
  useEffect(() => {
    try {
      const contextType = detectContextType(location.pathname);
      const context = createContextForType(contextType, user?.role);
      setPageContext(context);
    } catch (error) {
      console.error('[AIChatPanel] Error detecting/setting context:', error);
      // Don't break the AI chat if context detection fails
      setPageContext(undefined);
    }
  }, [location.pathname, user?.role, setPageContext]);

  // AI usage is now provided by the useAIUsage hook (see aiUsage above)

  // Helper function to get icon for action (MUST be defined before getContextSuggestions)
  const getIconForAction = (action: string) => {
    if (action.includes("resume") || action.includes("optimize") || action.includes("improve")) {
      return FileText;
    }
    if (action.includes("job") || action.includes("match")) {
      return Briefcase;
    }
    if (action.includes("analyze") || action.includes("score")) {
      return BarChart3;
    }
    return Sparkles;
  };

  // Get context-specific suggestions
  const getContextSuggestions = () => {
    if (pageContext && pageContext.availableActions.length > 0) {
      return pageContext.availableActions.slice(0, 4).map((action: string) => ({
        text: actionLabel(action),
        icon: getIconForAction(action),
        action: action as AIAction,
      }));
    }

    // Default suggestions
    return [
      { text: "Optimize my resume", icon: FileText, action: "optimize-content" as AIAction },
      { text: "Find job matches", icon: Briefcase, action: "match-candidates" as AIAction },
      { text: "Recruitment tips", icon: Users, action: "get-help" as AIAction },
      { text: "HR analytics", icon: BarChart3, action: "analyze-performance" as AIAction },
    ];
  };

  const quickSuggestions = getContextSuggestions();

  useEffect(() => {
    if (scrollAreaRef.current) {
      const element = scrollAreaRef.current;
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = useCallback(async (content: string, action?: AIAction) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);
    setRateLimitError(null);

    try {
      let responseMessage = "";

      // Build user info for system prompt personalisation
      const userInfo = user
        ? { name: user.name || user.email, role: user.role, plan: aiUsage.isUnlimited ? "pro" : "free" }
        : undefined;

      // Always use context-aware AI with enhanced system prompt. Read
      // the live authoring-form snapshot lazily (ref-backed getter — no
      // re-render coupling) and merge it so the prompt sees the
      // in-progress draft, held separately from pageContext so the route
      // effect doesn't clobber it (#1621).
      const liveFormSnapshot = getFormSnapshot();
      const activeContext = pageContext
        ? { ...pageContext, formSnapshot: liveFormSnapshot ?? pageContext.formSnapshot }
        : pageContext;
      const systemContent = activeContext
        ? createEnhancedSystemPrompt(activeContext, action, userInfo)
        : `You are the AI CHRO for hired.video — an expert HR advisor helping ${userInfo?.role || "users"} with career, hiring, and workforce decisions. Be concise, actionable, and personalised.${userInfo ? `\n\nUser: ${userInfo.name}, Role: ${userInfo.role}, Plan: ${userInfo.plan}` : ""}`;

      const systemMessage = { role: "system" as const, content: systemContent };
      const userChatMessage = { role: "user" as const, content: content.trim() };
      const chatMessages = [systemMessage, ...conversationHistory, userChatMessage];

      // Expose the AI-coach tool catalog to the model. The registry is
      // the single source: adding/removing tools there flows here for
      // free, no parallel allowlist. SuperAdmin-only tools (e.g. the
      // page→video scaffolder) surface only for SuperAdmins.
      const toolSpecs = getCoachToolSpecs({ superAdmin: isSuperAdminFromToken() });

      let sessionForTurn: string | undefined = currentSessionId ?? undefined;
      const accumulatedRuns: Message["toolRuns"] = [];

      // Initial turn — send the user message + tools.
      let response = await aiService.sendChatMessage(chatMessages, {
        sessionId: sessionForTurn,
        tools: toolSpecs,
      });
      sessionForTurn = response.sessionId ?? sessionForTurn;

      // Tool-call loop. Each turn: execute the model's requested calls
      // locally (registry.run), then POST back the results so the model
      // can produce its final prose. Capped to keep a runaway model from
      // looping forever.
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
              const args = tc.function.arguments
                ? JSON.parse(tc.function.arguments)
                : {};
              runResult = await tool.run({
                bound: { resumeId: activeResumeId },
                args,
              });
            } catch (err: any) {
              runResult = { summary: `Tool error: ${err?.message || String(err)}` };
            }
          }

          accumulatedRuns!.push({ toolId: tc.function.name, toolCallId: tc.id, result: runResult });

          // What we send BACK to the LLM. Mutating tools that left a
          // pending preview tell the model "shown to user, awaiting
          // their Apply" — the model wraps up the conversation without
          // pretending the edit is already on disk.
          const llmFacing =
            runResult.mutation?.status === "pending"
              ? { presented: true, awaiting: "user_apply", note: runResult.summary }
              : runResult;

          toolResults.push({
            toolCallId: tc.id,
            name: tc.function.name,
            result: llmFacing,
          });
        }

        // Follow-up turn — feed tool results back, get the final prose.
        response = await aiService.sendChatMessage(chatMessages, {
          sessionId: sessionForTurn,
          tools: toolSpecs,
          assistantToolCalls,
          toolResults,
        });
        sessionForTurn = response.sessionId ?? sessionForTurn;
      }

      responseMessage = response.message;
      if (sessionForTurn && sessionForTurn !== currentSessionId) {
        setCurrentSessionId(sessionForTurn);
      }

      // Update conversation history (final prose only — intermediate
      // tool turns aren't replayed when the user reloads the session).
      const newHistory: ChatMessage[] = [
        ...conversationHistory,
        { role: "user", content: content.trim() },
        { role: "assistant", content: responseMessage },
      ];
      setConversationHistory(newHistory);

      // Add AI response, with any tool runs surfaced inline.
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseMessage,
        sender: "ai",
        timestamp: new Date(),
        toolRuns: accumulatedRuns && accumulatedRuns.length > 0 ? accumulatedRuns : undefined,
      };
      setMessages((prev) => [...prev, aiMessage]);

    } catch (error) {
      console.error("Error in AI chat:", error);

      // Handle rate limit errors with upgrade prompt
      if (error instanceof AIUsageLimitError || error instanceof RateLimitError) {
        setRateLimitError({
          message: error.message,
          upgradeUrl: error.upgradeUrl,
          used: error.used,
          limit: error.limit,
          remaining: error.remaining,
        });

        // Add error message to chat
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: `⚠️ ${error.message}\n\n${TIER_COPY.upgradeForMoreAiTokens()}`,
          sender: "ai",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } else {
        // Other errors - provide fallback message
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content:
            "I'm experiencing a technical issue. Let me try to help you anyway! What would you like to know about resumes, job searching, or recruitment?",
          sender: "ai",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
      }
    } finally {
      setIsTyping(false);
      if (isAuthenticated) {
        aiUsage.refresh();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationHistory, currentSessionId, pageContext, getFormSnapshot, user, aiUsage, isAuthenticated, activeResumeId]);

  /**
   * Get a conversational prompt for an action
   * This converts action names into natural conversation starters
   */
  const getConversationalPrompt = (action: AIAction): string => {
    const prompts: Record<string, string> = {
      // Task actions
      "create-task": "I'd like to create a new task",
      "prioritize-tasks": "Can you help me prioritize my tasks?",
      "suggest-deadlines": "I need help setting realistic deadlines for my tasks",
      "break-down-task": "I have a complex task that I need to break down into smaller steps",
      "estimate-time": "Can you help me estimate how long my tasks will take?",
      "organize-tasks": "I need help organizing my tasks better",
      "suggest-schedule": "Can you create a schedule for my tasks?",
      "productivity-tips": "What are some productivity tips for managing my tasks?",

      // Resume actions
      "optimize-content": "I'd like to optimize my resume",
      "improve-summary": "Can you help me improve my resume summary?",
      "enhance-experience": "I want to enhance my work experience section",
      "suggest-skills": "What skills should I add to my resume?",
      "ats-score": "Can you check my resume's ATS score?",
      "keyword-suggestions": "What keywords should I include in my resume?",

      // Job actions
      "analyze-fit": "How well does this job match my profile?",
      "application-tips": "Can you give me tips for applying to this job?",
      "match-candidates": "Find candidates that match this job",
      "optimize-posting": "Help me optimize this job posting",

      // Profile actions
      "optimize-headline": "Help me create a better profile headline",
      "enhance-profile": "I want to improve my profile",

      // General actions
      "career-advice": "I need some career advice",
      "interview-prep": "Help me prepare for an interview",
      "get-help": "I need help with something",

      // Learning actions
      "recommend-courses": "Recommend courses to help me reach my learning goal",
      "create-study-plan": "Build me a study plan to learn this",
      "explain-concept": "Explain this concept in simple terms",
      "quiz-me": "Quiz me on what I'm learning to check my understanding",
      "outline-course": "Help me outline a course on this topic",
      "write-lesson": "Help me draft a lesson for this course",

      // Studio editor actions (#1910) — phrased so the studio context's
      // system prompt maps them onto the matching studio_* tool.
      "record-demo": "Record a demo of my screen",
      "add-scene": "Add a new scene to my video",
      "insert-cta": "Insert a call-to-action button into the current scene",
      "generate-scene-image": "Generate an image and add it to the current scene",
    };

    return prompts[action] || `Help me with ${action.replace(/-/g, " ")}`;
  };

  const handleQuickSuggestion = (suggestionText: string, action?: AIAction) => {
    // Convert action to conversational prompt
    const conversationalPrompt = action ? getConversationalPrompt(action) : suggestionText;

    console.log("[AIChatPanel] Suggestion clicked:", {
      originalText: suggestionText,
      action,
      conversationalPrompt,
      context: pageContext?.contextType,
    });

    // Send the conversational prompt with the action context
    handleSendMessage(conversationalPrompt, action);
  };

  // Allow AI access for all authenticated users (10 requests/month free, unlimited for Pro/Enterprise)
  const hasAIAccess = isAuthenticated;

  // Refresh usage when panel opens
  useEffect(() => {
    if (isAIChatOpen && isAuthenticated) {
      aiUsage.refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAIChatOpen, isAuthenticated]);

  // Load session list
  const fetchSessions = async () => {
    if (!isAuthenticated) return;
    setIsLoadingSessions(true);
    try {
      const res = await apiClient.get<Array<{ id: string; title: string; updatedAt: string }>>("/api/ai/sessions");
      if (res.data) setSessions(res.data);
    } catch {
      // silently fail
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Load a prior session into the chat
  const loadSession = async (sessionId: string) => {
    try {
      const res = await apiClient.get<{
        id: string;
        title: string;
        messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
      }>(`/api/ai/sessions/${sessionId}`);
      if (!res.data) return;
      setCurrentSessionId(sessionId);
      setConversationHistory(
        res.data.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      );
      setMessages([
        ...res.data.messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: (m.role === "user" ? "user" : "ai") as "user" | "ai",
          timestamp: new Date(m.createdAt),
        })),
      ]);
      setShowHistory(false);
    } catch {
      // silently fail
    }
  };

  // Delete a session
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/api/ai/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) startNewChat();
    } catch {
      // silently fail
    }
  };

  // Start a fresh conversation
  const startNewChat = () => {
    setCurrentSessionId(null);
    setConversationHistory([]);
    setRateLimitError(null);
    setMessages([
      {
        id: "welcome",
        content: getWelcomeMessage(),
        sender: "ai",
        timestamp: new Date(),
      },
    ]);
    setShowHistory(false);
  };

  // Copy message content to clipboard
  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      // silently fail
    }
  };

  // Open history and load sessions
  const toggleHistory = () => {
    if (!showHistory) fetchSessions();
    setShowHistory((v) => !v);
  };

  return (
    <div data-print-hide className={cn(
      "fixed inset-0 z-50 flex transition-opacity duration-500 ease-in-out print:hidden",
      isAIChatOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
    )}>
      {/* Backdrop */}
      <div
        className={cn(
          "flex-1 bg-black/20 backdrop-blur-sm touch-manipulation cursor-pointer",
          isMobile && "bg-black/30" // Slightly darker backdrop on mobile for better contrast
        )}
        onClick={closeAIChat}
        onTouchEnd={closeAIChat} // Additional touch event for better mobile responsiveness
      />

      {/* Panel */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 bg-background border-l shadow-2xl flex flex-col transition-all duration-500 ease-in-out overflow-hidden",
        isAIChatOpen ? "translate-x-0" : "translate-x-full",
        isMobile
          ? "w-[90%]"
          : "w-[60%] max-w-2xl"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between border-b bg-gradient-to-r from-brand-purple/10 to-brand-blue/10",
          isMobile ? "p-3" : "p-4" // Slightly less padding on mobile for more content space
        )}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full flex items-center justify-center">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                {t("aiChat.title", "AI CHRO")}
                {pageContext && (
                  <span className="text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {contextLabel(pageContext.contextType)}
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {pageContext
                  ? t("aiChat.subtitle.stats", "{{apis}} APIs available • {{actions}} actions", {
                      apis: pageContext.availableAPIs.length,
                      actions: pageContext.availableActions.length,
                    })
                  : t("aiChat.subtitle.default", "Always here to help")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={startNewChat}
              title={t("aiChat.newChat", "New chat")}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleHistory}
              title={t("aiChat.chatHistory", "Chat history")}
              className={cn(showHistory && "bg-muted")}
            >
              <History className="h-4 w-4" />
            </Button>
            {/* Page-context debug panel is a staff diagnostic — SuperAdmin only. */}
            {pageContext && isSuperAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowContextInfo(!showContextInfo)}
                title={t("aiChat.toggleContextInfo", "Toggle context info")}
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeAIChat}
              className={cn(
                "touch-manipulation",
                isMobile && "min-w-[44px] min-h-[44px]"
              )}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* AI Usage Indicator */}
        {isAuthenticated && <AIUsageLimitBanner usage={aiUsage} variant="inline" />}

        {/* Context Info Panel */}
        {showContextInfo && pageContext && (
          <div className="border-b bg-muted/50 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Code className="h-4 w-4" />
                {t("aiChat.context.pageContext", "Page Context")}
              </h4>
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("aiChat.context.type", "Type:")}</span>
                  <span className="font-mono bg-background px-2 py-0.5 rounded">
                    {pageContext.contextType}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("aiChat.context.url", "URL:")}</span>
                  <span className="font-mono text-xs truncate">
                    {pageContext.pageUrl}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">{t("aiChat.context.availableActions", "Available Actions")}</h4>
              <div className="flex flex-wrap gap-1">
                {pageContext.availableActions.map((action) => (
                  <span
                    key={action}
                    className="text-xs bg-background px-2 py-1 rounded-full"
                  >
                    {actionLabel(action)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">{t("aiChat.context.availableApis", "Available APIs ({{count}})", { count: pageContext.availableAPIs.length })}</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {pageContext.availableAPIs.map((api) => (
                  <div
                    key={api.id}
                    className="text-xs bg-background p-2 rounded flex items-start gap-2"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {api.method}
                    </span>
                    <div className="flex-1">
                      <div className="font-mono text-[10px]">{api.endpoint}</div>
                      <div className="text-muted-foreground">{api.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <input
                type="checkbox"
                id="useOrchestration"
                checked={useOrchestration}
                onChange={(e) => setUseOrchestration(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="useOrchestration" className="text-xs cursor-pointer">
                {t("aiChat.context.useOrchestration", "Use API Orchestration")}
              </label>
            </div>
          </div>
        )}

        {/* Chat History Sidebar */}
        {showHistory && (
          <div className="absolute inset-0 z-10 bg-background flex flex-col">
            <div className="flex items-center gap-2 p-4 border-b">
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h4 className="font-semibold text-sm flex-1">{t("aiChat.history.title", "Chat History")}</h4>
              <Button variant="ghost" size="sm" onClick={startNewChat} className="gap-1 text-xs">
                <Plus className="h-3 w-3" />
                {t("aiChat.history.newChat", "New Chat")}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoadingSessions ? (
                <div className="p-4 text-sm text-muted-foreground text-center">{t("status.loading", "Loading…")}</div>
              ) : sessions.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>{t("aiChat.history.empty", "No previous chats")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-start gap-3 group",
                        currentSessionId === session.id && "bg-muted"
                      )}
                      onClick={() => loadSession(session.id)}
                    >
                      <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{session.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(session.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                        onClick={(e) => deleteSession(session.id, e)}
                        title={t("aiChat.deleteChat", "Delete chat")}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 p-4 overflow-y-auto" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.sender === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3 text-sm group relative",
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {message.sender === "ai" && (
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Brain className="h-3 w-3 text-primary" />
                        <span className="text-xs font-medium text-primary">{t("aiChat.title", "AI CHRO")}</span>
                      </div>
                      <button
                        onClick={() => copyMessage(message.id, message.content)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-background"
                        title={t("aiChat.copyResponse", "Copy response")}
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  )}
                  {message.sender === "ai" ? (
                    <Markdown>{message.content}</Markdown>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                  {message.toolRuns && message.toolRuns.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.toolRuns.map((run) => (
                        <ToolCallCard
                          key={run.toolCallId}
                          toolId={run.toolId}
                          result={run.result}
                          onResultChange={(next) => {
                            // Update the surrounding bubble so reloading
                            // session state reflects the apply outcome.
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === message.id
                                  ? {
                                      ...m,
                                      toolRuns: m.toolRuns?.map((r) =>
                                        r.toolCallId === run.toolCallId
                                          ? { ...r, result: next }
                                          : r,
                                      ),
                                    }
                                  : m,
                              ),
                            );
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      {t("aiChat.assistant", "AI Assistant")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rate Limit Error Alert */}
        {rateLimitError && (
          <div className="px-4 py-2">
            <AIUsageLimitErrorBanner
              message={rateLimitError.message}
              used={rateLimitError.used}
              limit={rateLimitError.limit}
              upgradeUrl={rateLimitError.upgradeUrl}
              onDismiss={() => setRateLimitError(null)}
            />
          </div>
        )}

        {/* Quick Suggestions */}
        {messages.length <= 1 && (
          <div className="p-4 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
              {pageContext ? (
                <>
                  <Sparkles className="h-3 w-3" />
                  {t("aiChat.suggestions.contextAware", "Context-aware suggestions:")}
                </>
              ) : (
                t("aiChat.suggestions.quick", "Quick suggestions:")
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickSuggestions.map((suggestion, index) => {
                const Icon = suggestion.icon;
                return (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-auto p-2 text-left justify-start"
                    onClick={() =>
                      hasAIAccess ? handleQuickSuggestion(suggestion.text, suggestion.action) : undefined
                    }
                    disabled={!hasAIAccess}
                  >
                    <Icon className="h-3 w-3 mr-2" />
                    <span className="text-xs">{suggestion.text}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t">
          {hasAIAccess ? (
            <>
              {/* Quick-action chip — bypasses the "type 'generate an
                  image…'" indirection by surfacing the same shared
                  `MediaAiPromptPanel` inline. The image is generated
                  via the `generate_image` tool path (registered in
                  registry.ts) so the URL is auto-persisted to the
                  user's R2 library + shows up in MediaPicker. After
                  generation the URL is pushed into the chat as a user
                  message; the assistant sees it, can comment, and the
                  conversation continues naturally.

                  Studio-only: image generation feeds the Studio canvas,
                  so the chip surfaces only when the chat opens over the
                  Studio editor (contextType resolved from the /studio
                  route in page-meta-registry). */}
              {pageContext?.contextType === "studio" && (
              <div className="mb-2 flex items-center gap-2">
                <Popover open={aiImagePromptOpen} onOpenChange={setAiImagePromptOpen}>
                  <PopoverTrigger asChild>
                    <UiButton variant="outline" size="sm" className="h-7 gap-1">
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span className="text-xs">{t("aiChat.generateImage", "Generate image")}</span>
                    </UiButton>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-80 p-0">
                    <MediaAiPromptPanel
                      compact
                      kindNoun="image"
                      placeholder={t("aiChat.imagePlaceholder", "A clean studio backdrop, soft warm lighting…")}
                      onGenerated={(result, prompt) => {
                        // Synthesize a tool-run card directly — no
                        // model round-trip, no token spend on a chat
                        // reply. The image is already in the user's
                        // library (the route persisted it); we surface
                        // it inline with the same `ToolCallCard` the
                        // model-invoked path uses. The result shape
                        // comes from `buildGenerateImageResult` so the
                        // local + model paths produce byte-identical
                        // cards.
                        const url = result.resultUrl ?? result.previewUrl;
                        setAiImagePromptOpen(false);
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
                                result: buildGenerateImageResult({
                                  imageUrl: url,
                                  mode: result.mode,
                                  prompt,
                                }),
                              },
                            ],
                          },
                        ]);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              )}
              <AIInputBox
                onSubmit={(v) => handleSendMessage(v)}
                disabled={isTyping}
                placeholder={t("aiChat.inputPlaceholder", "Ask me anything about HR...")}
                helpText={<AIFooterCaption />}
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {isAuthenticated
                    ? t("aiChat.upgrade.authenticated", "You have 10 free AI requests per month. Upgrade to Pro for unlimited access.")
                    : t("aiChat.upgrade.anonymous", "Sign in to get 10 free AI requests per month. Upgrade to Pro for unlimited access.")}
                </div>
                <div className="flex gap-2">
                  {!isAuthenticated && (
                    <UiButton asChild variant="outline" size="sm">
                      <Link to="/login">{t("actions.signIn", "Sign In")}</Link>
                    </UiButton>
                  )}
                  <UiButton asChild size="sm">
                    <Link to="/pricing">{t("aiChat.viewPlans", "View Plans")}</Link>
                  </UiButton>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <AIFooterCaption />
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS - Context Creation
// ============================================================================
// Route → contextType resolution lives in the declarative
// unified page-meta registry (page-meta-registry.ts) — `detectContextType`
// is imported above. This file only maps a resolved contextType to a
// concrete context object.

/**
 * Create appropriate context object for a given context type and user role
 */
function createContextForType(contextType: AIContextType, userRole?: string) {
  switch (contextType) {
    case "dashboard":
      return createDashboardContext(undefined, undefined, userRole);

    case "resume-list":
    case "resume-create":
    case "resume-edit":
    case "resume-view":
      return createResumeContext(contextType, undefined, userRole);

    case "job-list":
    case "job-create":
    case "job-edit":
    case "job-view":
      return createJobContext(contextType, undefined, userRole);

    case "profile-view":
    case "profile-edit":
      return createProfileContext(contextType, undefined, userRole);

    case "search":
      return createSearchContext(undefined, undefined, undefined, undefined, userRole);

    case "tasks":
      return createTasksContext(undefined, userRole);

    // Studio + content surfaces — general-shaped payload, but pass the
    // resolved contextType through so the page keeps its label in the
    // system prompt + suggestions instead of flattening to "general".
    case "studio":
    case "article-view":
    case "article-edit":
    case "company-view":
    case "company-edit":
    case "course-learn":
    case "course-author":
    case "learning":
    case "interview-practice":
      return createGeneralContext(userRole, contextType);

    // outreach / messaging carry the general payload today (no bespoke
    // wiring in this panel); general is the fallback for everything else.
    case "outreach":
    case "messaging":
    case "general":
    default:
      return createGeneralContext(userRole);
  }
}
