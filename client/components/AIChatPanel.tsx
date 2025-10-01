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
} from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { Button, Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAI } from "@/lib/ai-context";
import {
  sendHRMessage,
  isAIServiceConfigured,
  type ChatMessage,
} from "@/lib/services/ai-service";
import { cn } from "@/lib/utils";
import Markdown from "@/components/Markdown";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
import { AIUsageLimitError, RateLimitError } from "@/lib/errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { aiOrchestrationService } from "@/lib/services/ai-orchestration-service";
import { getContextLabel, getActionLabel, getContextIcon } from "@/lib/utils/ai-context-helpers";
import type { AIAction } from "@/lib/types/ai-context";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  type?: "text" | "suggestion";
}

export default function AIChatPanel() {
  const { isAIChatOpen, closeAIChat, currentContext, pageContext } = useAI();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      content:
        "👋 Hi! I'm your AI HR Assistant. I can help you with recruiting, talent management, resume optimization, job matching, and more. What would you like to know?",
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
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

  // Get context-specific suggestions
  const getContextSuggestions = () => {
    if (pageContext && pageContext.availableActions.length > 0) {
      return pageContext.availableActions.slice(0, 4).map((action) => ({
        text: getActionLabel(action),
        icon: getIconForAction(action),
        action: action,
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

  // Helper function to get icon for action
  const getIconForAction = (action: AIAction) => {
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

      // Use orchestration if page context is available and orchestration is enabled
      if (useOrchestration && pageContext) {
        const result = await aiOrchestrationService.orchestrate({
          context: pageContext,
          userMessage: content.trim(),
          action,
        });

        if (result.success) {
          responseMessage = result.message;
          suggestions = result.suggestions || [];

          // Add API call details if in debug mode
          if (showContextInfo) {
            const apiDetails = result.apiCalls
              .map((call) => `- ${call.apiId}: ${call.success ? "✓" : "✗"}`)
              .join("\n");
            responseMessage += `\n\n**API Calls:**\n${apiDetails}`;
          }
        } else {
          responseMessage = result.message;
        }
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
    }
  };

  const handleQuickSuggestion = (suggestionText: string, action?: AIAction) => {
    handleSendMessage(suggestionText, action);
  };

  const { user, isAuthenticated } = useAuth();
  const isPro =
    user?.subscription === "pro" || user?.subscription === "enterprise";

  if (!isAIChatOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/20 backdrop-blur-sm"
        onClick={closeAIChat}
      />

      {/* Panel */}
      <div className="w-[60%] bg-background border-l shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-brand-purple/10 to-brand-blue/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full flex items-center justify-center">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                AI HR Assistant
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
            <Button variant="ghost" size="icon" onClick={closeAIChat}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

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
                      isPro ? handleQuickSuggestion(suggestion.text, suggestion.action) : undefined
                    }
                    disabled={!isPro}
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
          {isPro ? (
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
                  ? "Upgrade to Pro to use the AI Assistant."
                  : "Sign in to upgrade to Pro and use the AI Assistant."}
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
