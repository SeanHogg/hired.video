/**
 * AI Service for handling OpenRouter API calls
 * Provides a clean interface for AI chat functionality
 */

import { getAIConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
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

// ============================================================================
// AI SERVICE CLASS
// ============================================================================

class AIService {
  private readonly baseURL = 'https://openrouter.ai/api/v1';
  private readonly defaultHeaders = {
    'Content-Type': 'application/json',
    'HTTP-Referer': window.location.origin,
    'X-Title': 'MyVideoResume - AI HR Assistant',
  };

  /**
   * Send a chat completion request to OpenRouter
   */
  async sendChatMessage(
    messages: ChatMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<ChatResponse> {
    try {
      const config = getAIConfig();

      // Check if API key is available
      if (!config.apiKey) {
        logger.warn('OpenRouter API key not configured, falling back to mock response');
        return this.getMockResponse(messages[messages.length - 1]?.content || '');
      }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || config.model,
          messages: messages,
          max_tokens: options?.maxTokens || config.maxTokens,
          temperature: options?.temperature || config.temperature,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from OpenRouter API');
      }

      const message = data.choices[0].message.content;
      const usage = data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined;

      logger.info('AI chat response received', { 
        messageLength: message.length,
        usage 
      });

      return {
        message,
        usage,
      };

    } catch (error) {
      logger.error('AI service error', error);

      // Fallback to mock response on error
      logger.warn('Falling back to mock response due to AI service error');
      return this.getMockResponse(messages[messages.length - 1]?.content || '');
    } catch (configError) {
      // Handle configuration errors
      logger.error('AI service configuration error', configError);
      return this.getMockResponse(messages[messages.length - 1]?.content || '');
    }
  }

  /**
   * Get a mock response for development/fallback
   */
  private getMockResponse(userInput: string): ChatResponse {
    const input = userInput.toLowerCase();
    
    let mockMessage = '';
    
    if (input.includes('resume') || input.includes('cv')) {
      mockMessage = "🎯 I can help optimize your resume! Our AI analyzes your resume for ATS compatibility, suggests keyword improvements, and provides personalized recommendations. Would you like me to:\n\n• Scan your current resume for improvements\n• Suggest industry-specific keywords\n• Create a video resume script\n• Compare against job descriptions";
    } else if (input.includes('job') || input.includes('career') || input.includes('position')) {
      mockMessage = "💼 Great! I can help you find the perfect job opportunities. Our platform uses AI to match you with positions based on:\n\n• Skills and experience alignment\n• Salary expectations\n• Company culture fit\n• Growth potential\n\nWould you like me to start analyzing available positions for you?";
    } else if (input.includes('recruit') || input.includes('hire') || input.includes('talent')) {
      mockMessage = "🎯 Excellent! As a recruiter, I can help you:\n\n• Source passive candidates with AI matching\n• Create compelling job descriptions\n• Automate outreach campaigns\n• Track hiring metrics and ROI\n• Build talent pipelines\n\nWhich recruiting challenge would you like to tackle first?";
    } else if (input.includes('analytics') || input.includes('data') || input.includes('metrics')) {
      mockMessage = "📊 I can provide insights on your HR analytics! Our platform tracks:\n\n• Time-to-hire metrics\n• Candidate quality scores\n• Conversion rates\n• Cost-per-hire analysis\n• Employee retention data\n\nWhat specific metrics would you like to explore?";
    } else if (input.includes('help') || input.includes('how') || input.includes('what')) {
      mockMessage = "💡 I'm here to help with all aspects of HR and talent management! I can assist with:\n\n🎯 **For Job Seekers:**\n• Resume optimization\n• Job matching\n• Interview preparation\n• Career guidance\n\n👥 **For Recruiters:**\n• Candidate sourcing\n• Outreach automation\n• Pipeline management\n• Performance analytics\n\nWhat would you like to explore?";
    } else {
      mockMessage = "🤖 That's an interesting question! I'm constantly learning about HR and talent management. Based on what you've shared, I'd recommend exploring our:\n\n• AI-powered resume tools\n• Smart job matching system\n• Recruitment automation features\n• Analytics dashboard\n\nIs there a specific area you'd like to dive deeper into?";
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
  createSystemMessage(): ChatMessage {
    return {
      role: 'system',
      content: `You are an AI HR Assistant for MyVideoResume, a platform that helps job seekers and recruiters connect through video resumes and AI-powered matching.

Your role is to help users with:
- Resume optimization and ATS compatibility
- Job search strategies and career guidance
- Recruitment best practices and candidate sourcing
- HR analytics and performance metrics
- Video resume creation and optimization
- Interview preparation and tips

Always be helpful, professional, and focused on HR and talent management topics. Provide actionable advice and suggest relevant platform features when appropriate.

Keep responses concise but informative, using bullet points and emojis to improve readability.`,
    };
  }

  /**
   * Create a chat conversation with system context
   */
  async sendHRChatMessage(userMessage: string, conversationHistory: ChatMessage[] = []): Promise<ChatResponse> {
    const systemMessage = this.createSystemMessage();
    const userChatMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
    };

    const messages: ChatMessage[] = [
      systemMessage,
      ...conversationHistory,
      userChatMessage,
    ];

    return this.sendChatMessage(messages);
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
export async function sendHRMessage(message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
  return aiService.sendHRChatMessage(message, history);
}

/**
 * Check if AI service is properly configured
 */
export function isAIServiceConfigured(): boolean {
  try {
    const config = getAIConfig();
    const isConfigured = !!config.apiKey;
    logger.info('AI service configuration check', {
      isConfigured,
      hasApiKey: !!config.apiKey,
      model: config.model
    });
    return isConfigured;
  } catch (error) {
    logger.error('Error checking AI service configuration', error);
    return false;
  }
}
