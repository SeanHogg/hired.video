import React, { createContext, useContext, useState } from "react";
import type { AIContext as AIContextData } from "@/lib/types/ai-context";

// ============================================================================
// LEGACY CONTEXT TYPES (for backward compatibility)
// ============================================================================

// Generic payload that pages/components can pass to the AI side panel
export interface AIContextTarget {
  type: "form-field" | "section" | "none";
  formId?: string; // page/form identifier, e.g. "jobs.create"
  field?: string; // when type === "form-field", the field key to populate
}

export interface AIContextPayload<TMeta = unknown> {
  // Where this request originates from, e.g. "jobs.create"
  source: string;
  // The specific task the AI should perform, e.g. "generate_job_description"
  task: string;
  // Optional human-friendly hint for UI display
  hint?: string;
  // Where results should be applied
  target?: AIContextTarget;
  // Arbitrary metadata (strongly typed by caller via generic) such as form values
  meta?: TMeta;
}

// ============================================================================
// NEW CONTEXT SYSTEM
// ============================================================================

interface AIContextType {
  isAIChatOpen: boolean;
  /** Legacy context payload (deprecated, use pageContext instead) */
  currentContext?: AIContextPayload;
  /** New structured page context */
  pageContext?: AIContextData;
  openAIChat: () => void;
  // Open and set context in one call (preferred)
  openAIWithContext: <TMeta = unknown>(payload: AIContextPayload<TMeta>) => void;
  /** Set the current page context (new system) */
  setPageContext: (context: AIContextData | undefined) => void;
  /** Open AI chat with page context (new system) */
  openAIWithPageContext: (context: AIContextData) => void;
  closeAIChat: () => void;
  toggleAIChat: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [currentContext, setCurrentContext] = useState<AIContextPayload | undefined>(
    undefined,
  );
  const [pageContext, setPageContext] = useState<AIContextData | undefined>(undefined);

  const openAIChat = () => setIsAIChatOpen(true);
  const closeAIChat = () => {
    setIsAIChatOpen(false);
    // Clear contexts when closing
    setCurrentContext(undefined);
    setPageContext(undefined);
  };
  const toggleAIChat = () => setIsAIChatOpen(!isAIChatOpen);

  // Legacy context system
  const openAIWithContext = <TMeta,>(payload: AIContextPayload<TMeta>) => {
    setCurrentContext(payload as AIContextPayload);
    setPageContext(undefined); // Clear new context when using legacy
    setIsAIChatOpen(true);
  };

  // New context system
  const openAIWithPageContext = (context: AIContextData) => {
    setPageContext(context);
    setCurrentContext(undefined); // Clear legacy context when using new
    setIsAIChatOpen(true);
  };

  const value: AIContextType = {
    isAIChatOpen,
    currentContext,
    pageContext,
    openAIChat,
    openAIWithContext,
    setPageContext,
    openAIWithPageContext,
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
