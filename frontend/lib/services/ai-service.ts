/**
 * AI Service for handling backend AI API calls
 * Provides a clean interface for AI chat functionality
 */

import { logger } from "@/lib/logger";
import { apiClient } from "@/lib/api-client";
import { billingService } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";
import { TIER_COPY } from "@shared/tier-copy";
import { AIUsageLimitError, RateLimitError } from "@/lib/errors";

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Tool call returned by the backend when the LLM wants the client to
 *  execute a registered tool. The client looks up `function.name` in the
 *  tool registry, runs it, and POSTs back with the result. */
export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatResponse {
  message: string;
  /** Present when the LLM wants tools called before producing a final
   *  answer. The chat panel executes each call and POSTs back. */
  toolCalls?: ChatToolCall[];
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
  toolCalls?: ChatToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatResponseWithSession extends ChatResponse {
  sessionId?: string;
}

/** Function-calling spec forwarded to the LLM. Same shape that
 *  registry.getCoachToolSpecs() produces. */
export interface ChatToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface SendChatOptions {
  sessionId?: string;
  /** AI-coach tool catalog to expose to the model. */
  tools?: ChatToolSpec[];
  /** Tool-followup turn — the assistant tool_call message + matching tool
   *  results. Skips the user-message branch on the backend. */
  assistantToolCalls?: ChatToolCall[];
  toolResults?: Array<{ toolCallId: string; name?: string; result: unknown }>;
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
    // No `model` / `temperature` / `maxTokens` here — they're server-owned
    // via the use-case-driven facade (USE_CASE_PROFILES). Vendor and
    // sampling profile visibility are SuperAdmin-only.
    options?: SendChatOptions,
  ): Promise<ChatResponseWithSession> {
    try {
      logger.info("Sending AI chat request to backend");

      const isToolFollowup =
        !!options?.assistantToolCalls?.length && !!options?.toolResults?.length;

      // Extract system prompt, user message, and history
      const systemMsg = messages.find((m) => m.role === "system");
      const userMessage = isToolFollowup
        ? ""
        : messages[messages.length - 1]?.content || "";
      const history = messages
        .slice(0, isToolFollowup ? messages.length : -1)
        .filter((msg) => msg.role !== "system");

      // Enforce AI monthly usage limits client-side for immediate UX feedback
      const usage = await billingService.getMonthlyAIUsage();
      if (!usage.isUnlimited) {
        const limit = usage.limit ?? FREE_AI_MONTHLY_LIMIT;
        const remaining = usage.remaining ?? Math.max(0, limit - (usage.used ?? 0));
        if (remaining <= 0) {
          const limitError: AIServiceError = {
            code: "AI_USAGE_LIMIT_REACHED",
            message: TIER_COPY.aiRequestsExhausted({ limit }),
          };
          throw limitError as unknown as Error;
        }
      }

      const requestData = {
        message: userMessage,
        history: history.length > 0 ? history : undefined,
        // The rich system prompt is forwarded to the LLM facade; the
        // facade picks model + temperature based on the chat use case.
        systemPrompt: systemMsg?.content,
        sessionId: options?.sessionId,
        tools: options?.tools,
        assistantToolCalls: options?.assistantToolCalls,
        toolResults: options?.toolResults,
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
        toolCalls: response.data.toolCalls?.length ?? 0,
        usage: response.data.usage,
      });

      return {
        message: response.data.message,
        sessionId: response.data.sessionId,
        toolCalls: response.data.toolCalls,
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

}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const aiService = new AIService();
