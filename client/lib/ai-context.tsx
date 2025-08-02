import React, { createContext, useContext, useState } from 'react';

interface AIContextType {
  isAIChatOpen: boolean;
  openAIChat: () => void;
  closeAIChat: () => void;
  toggleAIChat: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);

  const openAIChat = () => setIsAIChatOpen(true);
  const closeAIChat = () => setIsAIChatOpen(false);
  const toggleAIChat = () => setIsAIChatOpen(!isAIChatOpen);

  const value: AIContextType = {
    isAIChatOpen,
    openAIChat,
    closeAIChat,
    toggleAIChat,
  };

  return (
    <AIContext.Provider value={value}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}
