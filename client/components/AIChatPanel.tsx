import {
  X,
  Send,
  Brain,
  FileText,
  Users,
  Briefcase,
  BarChart3,
} from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  import { Button as UiButton } from "@/components/ui/button";
  import { Link } from "react-router-dom";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  type?: "text" | "suggestion";
}

export default function AIChatPanel() {
  const { isAIChatOpen, closeAIChat } = useAI();
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isAIConfigured = isAIServiceConfigured();

  const quickSuggestions = [
    { text: "Optimize my resume", icon: FileText },
    { text: "Find job matches", icon: Briefcase },
    { text: "Recruitment tips", icon: Users },
    { text: "HR analytics", icon: BarChart3 },
  ];

  useEffect(() => {
    if (scrollAreaRef.current) {
      const element = scrollAreaRef.current;
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (content: string) => {
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

    try {
      // Send message to AI service
      const response = await sendHRMessage(content.trim(), conversationHistory);

      // Update conversation history
      const newHistory: ChatMessage[] = [
        ...conversationHistory,
        { role: "user", content: content.trim() },
        { role: "assistant", content: response.message },
      ];
      setConversationHistory(newHistory);

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.message,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Unexpected error in AI chat:", error);

      // This should rarely happen since AI service has internal fallbacks
      // But provide a user-friendly message just in case
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content:
          "I'm experiencing a technical issue. Let me try to help you anyway! What would you like to know about resumes, job searching, or recruitment?",
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickSuggestion = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  const { user, isAuthenticated } = useAuth();
  const isPro = user?.subscription === "pro" || user?.subscription === "enterprise";

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
              <h3 className="font-semibold">AI HR Assistant</h3>
              <p className="text-xs text-muted-foreground">
                Always here to help
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={closeAIChat}>
            <X className="h-4 w-4" />
          </Button>
        </div>

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

        {/* Quick Suggestions */}
        {messages.length <= 1 && (
          <div className="p-4 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground mb-3">
              Quick suggestions:
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
                    onClick={() => (isPro ? handleQuickSuggestion(suggestion.text) : undefined)}
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
                {isAuthenticated ? "Upgrade to Pro to use the AI Assistant." : "Sign in to upgrade to Pro and use the AI Assistant."}
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
