import React, { createContext, useContext, useState } from "react";

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

interface AIContextType {
  isAIChatOpen: boolean;
  currentContext?: AIContextPayload;
  openAIChat: () => void;
  // Open and set context in one call (preferred)
  openAIWithContext: <TMeta = unknown>(payload: AIContextPayload<TMeta>) => void;
  closeAIChat: () => void;
  toggleAIChat: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [currentContext, setCurrentContext] = useState<AIContextPayload | undefined>(
    undefined,
  );

  const openAIChat = () => setIsAIChatOpen(true);
  const closeAIChat = () => setIsAIChatOpen(false);
  const toggleAIChat = () => setIsAIChatOpen(!isAIChatOpen);
  const openAIWithContext = <TMeta,>(payload: AIContextPayload<TMeta>) => {
    setCurrentContext(payload as AIContextPayload);
    setIsAIChatOpen(true);
  };

  const value: AIContextType = {
    isAIChatOpen,
    currentContext,
    openAIChat,
    openAIWithContext,
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
