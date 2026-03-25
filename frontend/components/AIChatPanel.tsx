import {
  X,
  Send,
  Brain,
  FileText,
  Users,
  Briefcase,
  BarChart3,
  AlertCircle,
  Zap,
  Info,
  Sparkles,
  Code,
  AlertTriangle,
} from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { Button, Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAI } from "@/lib/ai-context";
import {
  sendHRMessage,
  isAIServiceConfigured,
  type ChatMessage,
} from "@/lib/services/ai-service";
import { cn } from "@/lib/utils";
import Markdown from "@/components/Markdown";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { Link, useLocation } from "react-router-dom";
import { AIUsageLimitError, RateLimitError } from "@/lib/errors";
import { useIsMobile } from "@/hooks/use-mobile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { aiService } from "@/lib/services/ai-service";
import {
  getContextLabel,
  getActionLabel,
  getContextIcon,
  createDashboardContext,
  createJobContext,
  createResumeContext,
  createProfileContext,
  createSearchContext,
  createTasksContext,
  createGeneralContext
} from "@/lib/utils/ai-context-helpers";
import type { AIAction, AIContextType, AIContext } from "@/lib/types/ai-context";
import { billingService } from "@/lib/services/billing-service";
import { getAPIsByAction } from "@/lib/config/ai-api-registry";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  type?: "text" | "suggestion";
}

// ============================================================================
// HELPER FUNCTIONS - System Prompt Creation
// ============================================================================

/**
 * Create an enhanced system prompt with context and action awareness
 */
function createEnhancedSystemPrompt(context: AIContext, action?: AIAction): string {
  const basePrompt = `You are the AI Chief Human Resources Officer (CHRO) for hired.video — an always-on HR guru who acts as the strategic brain behind every hiring, talent, and career decision on the platform.

Your expertise spans the full talent lifecycle:
- **Talent Acquisition**: Job description crafting, candidate sourcing, boolean search, recruiter outreach
- **Career Development**: Resume optimization, ATS compatibility, interview coaching, salary negotiation
- **Workforce Strategy**: Headcount planning, skills gap analysis, compensation benchmarking
- **HR Analytics**: Hiring funnel metrics, time-to-fill, quality-of-hire, retention drivers
- **Employer Branding**: EVP messaging, job posting optimization, video resume feedback
- **Compliance & Best Practices**: Structured interviews, bias reduction, equitable hiring

You serve three audiences on hired.video:
1. **Job seekers** — help them stand out, nail interviews, and land the right role
2. **Recruiters** — source smarter, qualify faster, and close candidates
3. **Employers** — build high-performing teams and manage their workforce

INTERACTION STYLE:
1. **Be Conversational and Strategic** — think like a CHRO, not a chatbot
2. **Gather Context First** — before diving into solutions, understand their specific situation
3. **Never Assume** — if they want something created, ask for the details
4. **Be Specific** — give actionable, tailored advice (not generic HR platitudes)
5. **Confirm Before Acting** — summarize and confirm before executing tasks
6. **Use Expert Framing** — reference real HR frameworks (STAR method, OKRs, etc.)

Keep responses concise but insightful. Use bullet points and clear structure. Lead with the most important insight.`;

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
    contextInstructions = `

CURRENT CONTEXT: Job ${context.contextType.includes("create") ? "Creation" : context.contextType.includes("edit") ? "Editing" : "Viewing"}
Help the user with job-related tasks. Provide insights on job fit, application strategies, and optimization.`;
  } else if (context.contextType === "dashboard") {
    contextInstructions = `

CURRENT CONTEXT: Dashboard
Provide an overview of their account status, suggest next steps, and help them navigate the platform effectively.`;
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
6. Only after confirmation, tell them you would create the task (but you cannot actually call APIs - explain this)

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

  return basePrompt + contextInstructions + actionInstructions;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIChatPanel() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { isAIChatOpen, closeAIChat, currentContext, pageContext, setPageContext } = useAI();
  const isMobile = useIsMobile();

  // Get personalized welcome message based on user role
  const getWelcomeMessage = () => {
    if (!isAuthenticated || !user) {
      return "👋 Hi! I'm your AI CHRO — Chief Human Resources Officer. Whether you're searching for your next role, sourcing top talent, or building a team, I'm here to guide you. What can I help you with?";
    }

    const roleMessages: Record<string, string> = {
      [USER_ROLES.JOB_SEEKER]: "👋 Hi! I'm your AI CHRO. I can help you craft a standout resume, ace your interviews, negotiate your salary, and land the role you deserve. What are we working on today?",
      [USER_ROLES.RECRUITER]: "👋 Hi! I'm your AI CHRO. I can help you source top candidates, write compelling job descriptions, run structured interviews, and close faster. What's on your hiring agenda?",
      [USER_ROLES.EMPLOYER]: "👋 Hi! I'm your AI CHRO. I can help you build high-performing teams, optimize your hiring process, benchmark compensation, and manage your workforce strategy. Where do you want to start?",
      [USER_ROLES.AFFILIATE]: "👋 Hi! I'm your AI CHRO. I can help you grow your affiliate business, optimize your referral strategy, and maximize your earnings on hired.video. What would you like to tackle?",
      [USER_ROLES.ADMIN]: "👋 Hi! I'm your AI CHRO. I can help you manage the platform, analyze user metrics, and drive better outcomes across the board. What do you need?",
      [USER_ROLES.SUPER_ADMIN]: "👋 Hi! I'm your AI CHRO. Full platform visibility is at your fingertips — analytics, user management, system insights. What are we looking at?",
    };

    return roleMessages[user.role] || roleMessages[USER_ROLES.JOB_SEEKER];
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);

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
  const [showContextInfo, setShowContextInfo] = useState(false);
  const [useOrchestration, setUseOrchestration] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isAIConfigured = isAIServiceConfigured();

  // Pre-populate input from homepage CHRO prompt (via currentContext.hint)
  useEffect(() => {
    if (isAIChatOpen && currentContext?.hint && currentContext.source === "homepage.chro") {
      setInputValue(currentContext.hint);
    }
  }, [isAIChatOpen, currentContext?.hint, currentContext?.source]);

  // Auto-detect and set context based on current route and user role
  useEffect(() => {
    console.log('[AIChatPanel] Route changed, detecting context for:', location.pathname);
    console.log('[AIChatPanel] User role:', user?.role || 'unauthenticated');

    try {
      const contextType = detectContextFromRoute(location.pathname);
      console.log('[AIChatPanel] Detected context type:', contextType);

      if (!contextType) {
        console.log('[AIChatPanel] No context detected, clearing');
        setPageContext(undefined);
        return;
      }

      // Create appropriate context based on type and user role
      const userRole = user?.role;
      const context = createContextForType(contextType, userRole);
      console.log('[AIChatPanel] Created context with role:', { contextType, userRole });

      setPageContext(context);
    } catch (error) {
      console.error('[AIChatPanel] Error detecting/setting context:', error);
      // Don't break the AI chat if context detection fails
      setPageContext(undefined);
    }
  }, [location.pathname, user?.role, setPageContext]);

  // AI Usage tracking
  const [aiUsage, setAiUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    isUnlimited: boolean;
  } | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

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
        text: getActionLabel(action),
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

  const handleSendMessage = async (content: string, action?: AIAction) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);
    setRateLimitError(null); // Clear any previous rate limit errors

    try {
      let responseMessage = "";
      let suggestions: string[] = [];

      // Use context-aware AI if page context is available
      if (pageContext) {
        // Create enhanced system message with context and action
        const systemMessage = {
          role: "system" as const,
          content: createEnhancedSystemPrompt(pageContext, action),
        };

        const userChatMessage = {
          role: "user" as const,
          content: content.trim(),
        };

        const messages = [
          systemMessage,
          ...conversationHistory,
          userChatMessage,
        ];

        const response = await aiService.sendChatMessage(messages);
        responseMessage = response.message;
      } else {
        // Fallback to regular AI service
        const response = await sendHRMessage(content.trim(), conversationHistory);
        responseMessage = response.message;
      }

      // Update conversation history
      const newHistory: ChatMessage[] = [
        ...conversationHistory,
        { role: "user", content: content.trim() },
        { role: "assistant", content: responseMessage },
      ];
      setConversationHistory(newHistory);

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseMessage,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // Add suggestions as separate messages
      if (suggestions.length > 0) {
        const suggestionMessage: Message = {
          id: (Date.now() + 2).toString(),
          content: `**Suggestions:**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
          sender: "ai",
          timestamp: new Date(),
          type: "suggestion",
        };
        setMessages((prev) => [...prev, suggestionMessage]);
      }
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
          content: `⚠️ ${error.message}\n\nUpgrade to Premium for unlimited AI access!`,
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
      // Refresh usage after sending a message
      if (isAuthenticated) {
        fetchAIUsage();
      }
    }
  };

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

  // Fetch AI usage when panel opens or after sending a message
  const fetchAIUsage = async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoadingUsage(true);
      const usage = await billingService.getMonthlyAIUsage();
      setAiUsage({
        used: usage.used ?? 0,
        limit: usage.limit ?? 10,
        remaining: usage.remaining ?? 10,
        isUnlimited: usage.isUnlimited ?? false,
      });
    } catch (error) {
      console.error("Failed to fetch AI usage:", error);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  // Fetch usage when panel opens
  useEffect(() => {
    if (isAIChatOpen && isAuthenticated) {
      fetchAIUsage();
    }
  }, [isAIChatOpen, isAuthenticated]);

  return (
    <div className={cn(
      "fixed inset-0 z-50 flex transition-opacity duration-500 ease-in-out",
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
        "fixed inset-y-0 right-0 z-50 bg-background border-l shadow-2xl flex flex-col transition-all duration-500 ease-in-out",
        isAIChatOpen ? "translate-x-0" : "translate-x-full",
        isMobile
          ? "w-[90%]" // Mobile: 90% width, matching sidebar and cart
          : "w-[60%] max-w-2xl"   // Desktop: 60% width with max-width for very large screens
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
                AI CHRO
                {pageContext && (
                  <span className="text-xs font-normal text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {getContextLabel(pageContext.contextType)}
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {pageContext
                  ? `${pageContext.availableAPIs.length} APIs available • ${pageContext.availableActions.length} actions`
                  : currentContext?.hint || "Always here to help"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pageContext && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowContextInfo(!showContextInfo)}
                title="Toggle context info"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeAIChat}
              className={cn(
                "touch-manipulation", // Optimize for touch on mobile
                isMobile && "min-w-[44px] min-h-[44px]" // Ensure minimum touch target size on mobile
              )}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* AI Usage Indicator */}
        {isAuthenticated && aiUsage && !aiUsage.isUnlimited && (
          <div className="px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground font-medium">
                AI Requests: {aiUsage.used}/{aiUsage.limit} used this month
              </span>
              {aiUsage.remaining <= 2 && aiUsage.remaining > 0 && (
                <Link to="/pricing" className="text-primary hover:underline font-medium">
                  Upgrade for Unlimited
                </Link>
              )}
            </div>
            <Progress
              value={(aiUsage.used / aiUsage.limit) * 100}
              className="h-1.5"
            />
            {aiUsage.remaining <= 2 && aiUsage.remaining > 0 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                <span>Only {aiUsage.remaining} request{aiUsage.remaining === 1 ? '' : 's'} remaining</span>
              </div>
            )}
            {aiUsage.remaining === 0 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span>Monthly limit reached. <Link to="/pricing" className="underline font-medium">Upgrade to Pro</Link> for unlimited access.</span>
              </div>
            )}
          </div>
        )}

        {isAuthenticated && aiUsage && aiUsage.isUnlimited && (
          <div className="px-4 py-2 border-b bg-gradient-to-r from-brand-purple/10 to-brand-blue/10">
            <div className="flex items-center gap-2 text-xs">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary font-medium">Unlimited AI Access</span>
            </div>
          </div>
        )}

        {/* Context Info Panel */}
        {showContextInfo && pageContext && (
          <div className="border-b bg-muted/50 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Code className="h-4 w-4" />
                Page Context
              </h4>
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-mono bg-background px-2 py-0.5 rounded">
                    {pageContext.contextType}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">URL:</span>
                  <span className="font-mono text-xs truncate">
                    {pageContext.pageUrl}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Available Actions</h4>
              <div className="flex flex-wrap gap-1">
                {pageContext.availableActions.map((action) => (
                  <span
                    key={action}
                    className="text-xs bg-background px-2 py-1 rounded-full"
                  >
                    {getActionLabel(action)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Available APIs ({pageContext.availableAPIs.length})</h4>
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
                Use API Orchestration
              </label>
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
                    "max-w-[80%] rounded-lg p-3 text-sm",
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {message.sender === "ai" && (
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">
                        AI Assistant
                      </span>
                    </div>
                  )}
                  {message.sender === "ai" ? (
                    <Markdown>{message.content}</Markdown>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
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
                      AI Assistant
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
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="flex flex-col gap-2">
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  {rateLimitError.limit && (
                    <div className="mb-2">
                      <strong>Usage:</strong> {rateLimitError.used} / {rateLimitError.limit} requests this month
                    </div>
                  )}
                  <div>{rateLimitError.message}</div>
                </div>
                <div className="flex gap-2">
                  <UiButton asChild size="sm" className="bg-gradient-to-r from-brand-purple to-brand-blue">
                    <Link to={rateLimitError.upgradeUrl || "/pricing"}>
                      <Zap className="h-3 w-3 mr-1" />
                      Upgrade to Premium
                    </Link>
                  </UiButton>
                  <UiButton
                    variant="outline"
                    size="sm"
                    onClick={() => setRateLimitError(null)}
                  >
                    Dismiss
                  </UiButton>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Quick Suggestions */}
        {messages.length <= 1 && (
          <div className="p-4 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
              {pageContext ? (
                <>
                  <Sparkles className="h-3 w-3" />
                  Context-aware suggestions:
                </>
              ) : (
                "Quick suggestions:"
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
            <div className="flex gap-2">
              <Input
                placeholder="Ask me anything about HR..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleSendMessage(inputValue);
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {isAuthenticated
                  ? "You have 10 free AI requests per month. Upgrade to Pro for unlimited access."
                  : "Sign in to get 10 free AI requests per month. Upgrade to Pro for unlimited access."}
              </div>
              <div className="flex gap-2">
                {!isAuthenticated && (
                  <UiButton asChild variant="outline" size="sm">
                    <Link to="/login">Sign In</Link>
                  </UiButton>
                )}
                <UiButton asChild size="sm">
                  <Link to="/pricing">View Plans</Link>
                </UiButton>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {isAIConfigured
              ? "Powered by OpenRouter AI"
              : "AI service not configured - using demo responses"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS - Route Detection & Context Creation
// ============================================================================

/**
 * Detect AI context type from current route
 */
function detectContextFromRoute(pathname: string): AIContextType | null {
  // Dashboard
  if (pathname === "/dashboard") return "dashboard";

  // Resume routes
  if (pathname.startsWith("/resumes/new") || pathname.startsWith("/resumes/create")) {
    return "resume-create";
  }
  if (pathname.startsWith("/resumes/edit/") || (pathname.includes("/resumes/") && pathname.includes("/edit"))) {
    return "resume-edit";
  }
  if (pathname.startsWith("/resumes/") && !pathname.includes("/edit")) {
    return "resume-view";
  }
  if (pathname === "/resumes") return "resume-list";

  // Job routes
  if (pathname.startsWith("/jobs/new") || pathname.startsWith("/jobs/create")) {
    return "job-create";
  }
  if (pathname.startsWith("/jobs/edit/") || (pathname.includes("/jobs/") && pathname.includes("/edit"))) {
    return "job-edit";
  }
  if (pathname.startsWith("/jobs/") && !pathname.includes("/edit")) {
    return "job-view";
  }
  if (pathname === "/jobs") return "job-list";

  // Profile routes
  if (pathname.startsWith("/profile/edit") || pathname === "/settings") {
    return "profile-edit";
  }
  if (pathname.startsWith("/profile/") || pathname.startsWith("/people/")) {
    return "profile-view";
  }

  // Tasks route
  if (pathname === "/tasks" || pathname.startsWith("/tasks")) {
    return "tasks";
  }

  // AI Coach route
  if (pathname === "/chat") {
    return "general"; // Use general context for AI Coach page
  }

  // Other routes
  if (pathname === "/outreach") return "outreach";
  if (pathname === "/messages" || pathname.startsWith("/messages/")) return "messaging";
  if (pathname === "/search" || pathname === "/people" || pathname === "/companies") {
    return "search";
  }

  // Home page
  if (pathname === "/" || pathname === "/index") return "search";

  // Default: general context
  return "general";
}

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

    case "outreach":
    case "messaging":
      return createGeneralContext(userRole);

    case "general":
    default:
      return createGeneralContext(userRole);
  }
}
