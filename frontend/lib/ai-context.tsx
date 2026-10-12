import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
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
  /** Push (or clear) the live authoring-form snapshot. Backed by a ref,
   *  NOT state — writing it does not re-render `useAI()` consumers, so
   *  streaming a form's values on every keystroke is free. The panel
   *  reads the latest value lazily at send time via `getFormSnapshot`. */
  setFormSnapshot: (snapshot: Record<string, unknown> | undefined) => void;
  /** Read the latest authoring-form snapshot (ref-backed; call at send
   *  time). Held separately from `pageContext` so the route-change
   *  effect that rebuilds `pageContext` never clobbers it. */
  getFormSnapshot: () => Record<string, unknown> | undefined;
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
  /** True while a page renders its own in-page AI chat (e.g. the kit
   *  chat column). Global launchers hide so there is only ONE Brain. */
  hasDockedChat: boolean;
  /** Register an in-page AI chat; returns the unregister fn. Use the
   *  `useDockedAIChat()` hook rather than calling this directly. */
  registerDockedChat: () => () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [pageContext, setPageContext] = useState<AIContextData | undefined>(undefined);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(undefined);
  // Ref, not state: authoring forms stream values here on every
  // keystroke; a ref write skips the provider re-render cascade that
  // useState would trigger across every useAI() consumer.
  const formSnapshotRef = useRef<Record<string, unknown> | undefined>(undefined);
  const setFormSnapshot = useCallback(
    (snapshot: Record<string, unknown> | undefined) => {
      formSnapshotRef.current = snapshot;
    },
    [],
  );
  const getFormSnapshot = useCallback(() => formSnapshotRef.current, []);

  // Count, not boolean: two docked surfaces may overlap during a route
  // transition, and the first to unmount must not re-show the launcher.
  const [dockedChatCount, setDockedChatCount] = useState(0);
  const registerDockedChat = useCallback(() => {
    setDockedChatCount((n) => n + 1);
    return () => setDockedChatCount((n) => Math.max(0, n - 1));
  }, []);

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
    setFormSnapshot,
    getFormSnapshot,
    openAIChat,
    openAIWithMessage,
    clearPendingMessage,
    setPageContext,
    openAIWithPageContext,
    openAIWithPageContextAndMessage,
    closeAIChat,
    toggleAIChat,
    hasDockedChat: dockedChatCount > 0,
    registerDockedChat,
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

/**
 * Declare that the calling component IS an in-page AI chat. While it is
 * mounted the global floating Brain launcher hides, so a page never shows
 * two AI entry points. Call it from the chat surface itself (self-gating —
 * no page-level prop or path rule needed).
 */
export function useDockedAIChat(): void {
  const { registerDockedChat } = useAI();
  useEffect(() => registerDockedChat(), [registerDockedChat]);
}

/**
 * Canonical href for opening the AI Coach page with a priming message that
 * auto-sends as soon as the side panel mounts. Every callsite that wants
 * to drive the user into a primed AI chat (homepage chips, marketing
 * pages, the Tools catalog) should route through here so the `?q=` query
 * shape stays consistent — duplicate `encodeURIComponent` calls drift on
 * whitespace + emoji handling otherwise.
 */
export function aiCoachHref(primingMessage: string): string {
  return `/ai-coach?q=${encodeURIComponent(primingMessage)}`;
}
