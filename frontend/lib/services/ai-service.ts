/**
 * AI Service for handling backend AI API calls
 * Provides a clean interface for AI chat functionality
 */

import { logger } from "@/lib/logger";
import { apiClient } from "@/lib/api-client";
import { billingService } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";
import { AIUsageLimitError, RateLimitError } from "@/lib/errors";
import type {
  AIContext,
  AIContextPayload,
  AIContextResponse,
  AIAction,
} from "@/lib/types/ai-context";

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  message: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIServiceError {
  code: string;
  message: string;
  details?: any;
}

export interface BackendChatResponse {
  message: string;
  sessionId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatResponseWithSession extends ChatResponse {
  sessionId?: string;
}

// ============================================================================
// AI SERVICE CLASS
// ============================================================================

class AIService {
  /**
   * Send a chat completion request to backend API
   */
  async sendChatMessage(
    messages: ChatMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      sessionId?: string;
    },
  ): Promise<ChatResponseWithSession> {
    try {
      logger.info("Sending AI chat request to backend");

      // Extract system prompt, user message, and history
      const systemMsg = messages.find((m) => m.role === "system");
      const userMessage = messages[messages.length - 1]?.content || "";
      const history = messages
        .slice(0, -1)
        .filter((msg) => msg.role !== "system");

      // Enforce AI monthly usage limits client-side for immediate UX feedback
      const usage = await billingService.getMonthlyAIUsage();
      if (!usage.isUnlimited) {
        const limit = usage.limit ?? FREE_AI_MONTHLY_LIMIT;
        const remaining = usage.remaining ?? Math.max(0, limit - (usage.used ?? 0));
        if (remaining <= 0) {
          const limitError: AIServiceError = {
            code: "AI_USAGE_LIMIT_REACHED",
            message: `You've used all ${limit} free AI requests for this month. Upgrade to Premium for unlimited AI.`,
          };
          throw limitError as unknown as Error;
        }
      }

      const requestData = {
        message: userMessage,
        history: history.length > 0 ? history : undefined,
        // Pass the rich system prompt so the backend sends it to OpenRouter
        systemPrompt: systemMsg?.content,
        sessionId: options?.sessionId,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      };

      const response = await apiClient.post<BackendChatResponse>(
        "/api/ai/chat",
        requestData,
      );

      if (!response.data) {
        throw new Error("Invalid response from backend AI API");
      }

      logger.info("AI chat response received from backend", {
        messageLength: response.data.message?.length || 0,
        sessionId: response.data.sessionId,
        usage: response.data.usage,
      });

      return {
        message: response.data.message,
        sessionId: response.data.sessionId,
        usage: response.data.usage,
      };
    } catch (error: unknown) {
      logger.error("AI service error", { error });

      if (error instanceof AIUsageLimitError || error instanceof RateLimitError) {
        logger.warn("AI usage limit reached, propagating to UI");
        throw error;
      }

      const maybe = error as Partial<AIServiceError> | undefined;
      if (maybe && maybe.code === "AI_USAGE_LIMIT_REACHED") {
        throw error as Error;
      }

      logger.warn("Falling back to mock response due to AI service error");
      return this.getMockResponse(messages[messages.length - 1]?.content || "");
    }
  }

  /**
   * Get a mock response for development/fallback
   */
  private getMockResponse(userInput: string): ChatResponse {
    const input = userInput.toLowerCase();

    let mockMessage = "";

    if (input.includes("resume") || input.includes("cv")) {
      mockMessage =
        "🎯 I can help optimize your resume! Our AI analyzes your resume for ATS compatibility, suggests keyword improvements, and provides personalized recommendations. Would you like me to:\n\n• Scan your current resume for improvements\n• Suggest industry-specific keywords\n• Create a video resume script\n• Compare against job descriptions";
    } else if (
      input.includes("job") ||
      input.includes("career") ||
      input.includes("position")
    ) {
      mockMessage =
        "💼 Great! I can help you find the perfect job opportunities. Our platform uses AI to match you with positions based on:\n\n• Skills and experience alignment\n• Salary expectations\n• Company culture fit\n• Growth potential\n\nWould you like me to start analyzing available positions for you?";
    } else if (
      input.includes("recruit") ||
      input.includes("hire") ||
      input.includes("talent")
    ) {
      mockMessage =
        "🎯 Excellent! As a recruiter, I can help you:\n\n• Source passive candidates with AI matching\n• Create compelling job descriptions\n• Automate outreach campaigns\n• Track hiring metrics and ROI\n• Build talent pipelines\n\nWhich recruiting challenge would you like to tackle first?";
    } else if (
      input.includes("analytics") ||
      input.includes("data") ||
      input.includes("metrics")
    ) {
      mockMessage =
        "📊 I can provide insights on your HR analytics! Our platform tracks:\n\n• Time-to-hire metrics\n• Candidate quality scores\n• Conversion rates\n• Cost-per-hire analysis\n• Employee retention data\n\nWhat specific metrics would you like to explore?";
    } else if (
      input.includes("help") ||
      input.includes("how") ||
      input.includes("what")
    ) {
      mockMessage =
        "💡 I'm here to help with all aspects of HR and talent management! I can assist with:\n\n🎯 **For Job Seekers:**\n• Resume optimization\n• Job matching\n• Interview preparation\n• Career guidance\n\n👥 **For Recruiters:**\n• Candidate sourcing\n• Outreach automation\n• Pipeline management\n• Performance analytics\n\nWhat would you like to explore?";
    } else {
      mockMessage =
        "🤖 That's an interesting question! I'm constantly learning about HR and talent management. Based on what you've shared, I'd recommend exploring our:\n\n• AI-powered resume tools\n• Smart job matching system\n• Recruitment automation features\n• Analytics dashboard\n\nIs there a specific area you'd like to dive deeper into?";
    }

    return {
      message: mockMessage,
      usage: {
        promptTokens: userInput.length / 4, // Rough estimate
        completionTokens: mockMessage.length / 4,
        totalTokens: (userInput.length + mockMessage.length) / 4,
      },
    };
  }

  /**
   * Create a system message for HR context
   */
  createSystemMessage(context?: AIContext): ChatMessage {
    let contextSpecificInstructions = "";

    if (context) {
      contextSpecificInstructions = this.getContextSpecificInstructions(context);
    }

    return {
      role: "system",
      content: `You are an AI HR Assistant for hired.video, a platform that helps job seekers and recruiters connect through video resumes and AI-powered matching.

Your role is to help users with:
- Resume optimization and ATS compatibility
- Job search strategies and career guidance
- Recruitment best practices and candidate sourcing
- HR analytics and performance metrics
- Video resume creation and optimization
- Interview preparation and tips
- Task management and productivity

${contextSpecificInstructions}

IMPORTANT INTERACTION RULES:
1. **Be Conversational**: Always engage in a natural conversation with the user
2. **Gather Information First**: Before making any API calls or taking actions, ask the user for ALL required information
3. **Validate Requirements**: If an action requires specific data (like creating a task), ask for:
   - Task title/name (required)
   - Description (optional but helpful)
   - Start date (required)
   - End date/deadline (optional)
   - Priority level (optional)
   - Any other relevant details
4. **Confirm Before Acting**: Once you have all the information, summarize it back to the user and ask for confirmation before proceeding
5. **Handle Missing Data**: If the user provides incomplete information, politely ask for the missing required fields
6. **Provide Context**: Explain what you're going to do and why it's helpful

Example interaction for "create-task":
User: "Create a task"
AI: "I'd be happy to help you create a task! To get started, I need a few details:
- What would you like to name this task?
- When do you want to start working on it?
- Is there a deadline?
- What's the priority level (high, medium, low)?

Tell me about the task you'd like to create!"

Always be helpful, professional, and focused on HR and talent management topics. Provide actionable advice and suggest relevant platform features when appropriate.

Keep responses concise but informative, using bullet points and emojis to improve readability.`,
    };
  }

  /**
   * Get context-specific instructions for the AI
   */
  private getContextSpecificInstructions(context: AIContext): string {
    switch (context.contextType) {
      case "tasks":
        return `CURRENT CONTEXT: Task Management Page
The user is on the task management page. Available actions: ${context.availableActions.join(", ")}

When helping with tasks:
- For "create-task": Ask for task name, description, start date, deadline, and priority before creating
- For "prioritize-tasks": Analyze their current tasks and suggest a priority order with reasoning
- For "organize-tasks": Suggest categorization and grouping strategies
- For "break-down-task": Help break complex tasks into smaller, manageable subtasks
- For "suggest-schedule": Create a realistic schedule based on their tasks and deadlines
- For "productivity-tips": Provide actionable productivity advice relevant to their tasks

Available APIs: ${context.availableAPIs.map((api) => `${api.id} (${api.endpoint})`).join(", ")}`;

      case "resume-create":
      case "resume-edit":
        return `CURRENT CONTEXT: Resume ${context.contextType === "resume-create" ? "Creation" : "Editing"}
The user is working on their resume. Available actions: ${context.availableActions.join(", ")}

Help them create a compelling, ATS-optimized resume. Ask about their experience, skills, and target roles before making suggestions.`;

      case "job-view":
        return `CURRENT CONTEXT: Job Viewing
The user is viewing a job posting. Available actions: ${context.availableActions.join(", ")}

Help them understand if this job is a good fit, suggest how to tailor their application, and provide interview preparation tips.`;

      case "dashboard":
        return `CURRENT CONTEXT: Dashboard
The user is on their dashboard. Available actions: ${context.availableActions.join(", ")}

Provide an overview of their account status, suggest next steps, and help them navigate the platform effectively.`;

      default:
        return `CURRENT CONTEXT: ${context.contextType}
Available actions: ${context.availableActions.join(", ")}`;
    }
  }

  /**
   * Create a chat conversation with system context
   */
  async sendHRChatMessage(
    userMessage: string,
    conversationHistory: ChatMessage[] = [],
  ): Promise<ChatResponse> {
    const systemMessage = this.createSystemMessage();
    const userChatMessage: ChatMessage = {
      role: "user",
      content: userMessage,
    };

    const messages: ChatMessage[] = [
      systemMessage,
      ...conversationHistory,
      userChatMessage,
    ];

    return this.sendChatMessage(messages);
  }

  /**
   * Send a context-aware AI request
   * This method sends the page context along with the user's message
   */
  async sendContextAwareMessage(
    message: string,
    context: AIContext,
    history: ChatMessage[] = [],
    action?: AIAction,
  ): Promise<AIContextResponse> {
    try {
      logger.info("Sending context-aware AI request", {
        contextType: context.contextType,
        action,
      });

      // Enforce AI monthly usage limits client-side for immediate UX feedback
      const usage = await billingService.getMonthlyAIUsage();
      if (!usage.isUnlimited) {
        const limit = usage.limit ?? FREE_AI_MONTHLY_LIMIT;
        const remaining = usage.remaining ?? Math.max(0, limit - (usage.used ?? 0));
        if (remaining <= 0) {
          const limitError: AIServiceError = {
            code: "AI_USAGE_LIMIT_REACHED",
            message: `You've used all ${limit} free AI requests for this month. Upgrade to Premium for unlimited AI.`,
          };
          throw limitError as unknown as Error;
        }
      }

      const payload: AIContextPayload = {
        context,
        message,
        history,
        action,
      };

      const response = await apiClient.post<AIContextResponse>(
        "/api/ai/context",
        payload,
      );

      if (!response.data) {
        throw new Error("Invalid response from context-aware AI API");
      }

      logger.info("Context-aware AI response received");
      return response.data;
    } catch (error: unknown) {
      logger.error("Context-aware AI service error", { error });

      // If this is an AI usage limit or rate limit error, propagate it to the UI
      if (error instanceof AIUsageLimitError || error instanceof RateLimitError) {
        logger.warn("AI usage limit reached, propagating to UI");
        throw error;
      }

      // Also check for legacy error format
      const maybe = error as Partial<AIServiceError> | undefined;
      if (maybe && maybe.code === "AI_USAGE_LIMIT_REACHED") {
        throw error as Error;
      }

      // For other errors, throw with context
      throw new Error(
        `Context-aware AI request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const aiService = new AIService();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Send a simple HR-focused chat message
 */
export async function sendHRMessage(
  message: string,
  history: ChatMessage[] = [],
): Promise<ChatResponse> {
  return aiService.sendHRChatMessage(message, history);
}

/**
 * Send a context-aware AI message
 */
export async function sendContextAwareMessage(
  message: string,
  context: AIContext,
  history: ChatMessage[] = [],
  action?: AIAction,
): Promise<AIContextResponse> {
  return aiService.sendContextAwareMessage(message, context, history, action);
}

/**
 * Check if AI service is properly configured (always true since backend handles it)
 */
export function isAIServiceConfigured(): boolean {
  try {
    logger.info(
      "AI service configuration check - backend handles AI configuration",
    );
    return true; // Backend handles AI configuration
  } catch (error) {
    logger.error("Error checking AI service configuration", error);
    return false;
  }
}
