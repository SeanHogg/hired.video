import React, { createContext, useContext, useState } from "react";
import type { AIContext as AIContextData } from "@/lib/types/ai-context";

// ============================================================================
// AI PANEL CONTEXT
// ============================================================================

interface AIContextType {
  isAIChatOpen: boolean;
  /** Structured page context — read by AIChatPanel to build the system
   *  prompt, suggest actions, and (for authoring pages like Create Job)
   *  surface the live form snapshot to the LLM. */
  pageContext?: AIContextData;
  /** Message to auto-send when the chat panel opens. Used to prime the
   *  conversation when the user clicks a "Use AI" affordance — the panel
   *  pre-sends the message so the model is briefed without the user
   *  having to retype intent. */
  pendingMessage?: string;
  openAIChat: () => void;
  /** Open AI chat and immediately queue a message to send. */
  openAIWithMessage: (message: string) => void;
  /** Clear the pending message after it has been sent. */
  clearPendingMessage: () => void;
  /** Set the current page context. */
  setPageContext: (context: AIContextData | undefined) => void;
  /** Open AI chat with page context. */
  openAIWithPageContext: (context: AIContextData) => void;
  /** Open the panel with both page context and a priming message in one
   *  shot — the priming message arrives at the model on the very first
   *  turn, so the response acts on the page context immediately. */
  openAIWithPageContextAndMessage: (
    context: AIContextData,
    message: string,
  ) => void;
  closeAIChat: () => void;
  toggleAIChat: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [pageContext, setPageContext] = useState<AIContextData | undefined>(undefined);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);

  const openAIChat = () => setIsAIChatOpen(true);
  const closeAIChat = () => {
    setIsAIChatOpen(false);
    setPageContext(undefined);
  };
  const toggleAIChat = () => setIsAIChatOpen(!isAIChatOpen);

  const openAIWithMessage = (message: string) => {
    setPendingMessage(message);
    setIsAIChatOpen(true);
  };

  const clearPendingMessage = () => setPendingMessage(undefined);

  const openAIWithPageContext = (context: AIContextData) => {
    setPageContext(context);
    setIsAIChatOpen(true);
  };

  const openAIWithPageContextAndMessage = (
    context: AIContextData,
    message: string,
  ) => {
    setPageContext(context);
    setPendingMessage(message);
    setIsAIChatOpen(true);
  };

  const value: AIContextType = {
    isAIChatOpen,
    pageContext,
    pendingMessage,
    openAIChat,
    openAIWithMessage,
    clearPendingMessage,
    setPageContext,
    openAIWithPageContext,
    openAIWithPageContextAndMessage,
    closeAIChat,
    toggleAIChat,
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI() {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error("useAI must be used within an AIProvider");
  }
  return context;
}
