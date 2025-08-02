import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Send,
  Brain,
  Sparkles,
  MessageCircle,
  User,
  Zap,
  FileText,
  Users,
  Briefcase,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAI } from "@/lib/ai-context";

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
      content: "👋 Hi! I'm your AI HR Assistant. I can help you with recruiting, talent management, resume optimization, job matching, and more. What would you like to know?",
      sender: "ai",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      const aiResponse = generateAIResponse(content);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1500);
  };

  const generateAIResponse = (userInput: string): string => {
    const input = userInput.toLowerCase();
    
    if (input.includes("resume") || input.includes("cv")) {
      return "🎯 I can help optimize your resume! Our AI analyzes your resume for ATS compatibility, suggests keyword improvements, and provides personalized recommendations. Would you like me to:\n\n• Scan your current resume for improvements\n• Suggest industry-specific keywords\n• Create a video resume script\n• Compare against job descriptions";
    }
    
    if (input.includes("job") || input.includes("career") || input.includes("position")) {
      return "💼 Great! I can help you find the perfect job opportunities. Our platform uses AI to match you with positions based on:\n\n• Skills and experience alignment\n• Salary expectations\n• Company culture fit\n• Growth potential\n\nWould you like me to start analyzing available positions for you?";
    }
    
    if (input.includes("recruit") || input.includes("hire") || input.includes("talent")) {
      return "🎯 Excellent! As a recruiter, I can help you:\n\n• Source passive candidates with AI matching\n• Create compelling job descriptions\n• Automate outreach campaigns\n• Track hiring metrics and ROI\n• Build talent pipelines\n\nWhich recruiting challenge would you like to tackle first?";
    }
    
    if (input.includes("analytics") || input.includes("data") || input.includes("metrics")) {
      return "📊 I can provide insights on your HR analytics! Our platform tracks:\n\n• Time-to-hire metrics\n• Candidate quality scores\n• Conversion rates\n• Cost-per-hire analysis\n• Employee retention data\n\nWhat specific metrics would you like to explore?";
    }
    
    if (input.includes("help") || input.includes("how") || input.includes("what")) {
      return "💡 I'm here to help with all aspects of HR and talent management! I can assist with:\n\n🎯 **For Job Seekers:**\n• Resume optimization\n• Job matching\n• Interview preparation\n• Career guidance\n\n👥 **For Recruiters:**\n• Candidate sourcing\n• Outreach automation\n• Pipeline management\n• Performance analytics\n\nWhat would you like to explore?";
    }
    
    // Default response
    return "🤖 That's an interesting question! I'm constantly learning about HR and talent management. Based on what you've shared, I'd recommend exploring our:\n\n• AI-powered resume tools\n• Smart job matching system\n• Recruitment automation features\n• Analytics dashboard\n\nIs there a specific area you'd like to dive deeper into?";
  };

  const handleQuickSuggestion = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="flex-1 bg-black/20 backdrop-blur-sm" 
        onClick={onClose}
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
              <p className="text-xs text-muted-foreground">Always here to help</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
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
                  message.sender === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3 text-sm",
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {message.sender === "ai" && (
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">AI Assistant</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-primary">AI Assistant</span>
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
            <p className="text-xs text-muted-foreground mb-3">Quick suggestions:</p>
            <div className="grid grid-cols-2 gap-2">
              {quickSuggestions.map((suggestion, index) => {
                const Icon = suggestion.icon;
                return (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-auto p-2 text-left justify-start"
                    onClick={() => handleQuickSuggestion(suggestion.text)}
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
          <p className="text-xs text-muted-foreground mt-2 text-center">
            AI responses are simulated for demo purposes
          </p>
        </div>
      </div>
    </div>
  );
}
