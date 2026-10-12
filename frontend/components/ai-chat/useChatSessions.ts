/**
 * useChatSessions — the saved-conversation list behind the chat's History
 * view (list / load / delete). Used by `useAIChatThread`; the thread owns
 * the message state and receives a loaded session through `onLoad`.
 */
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface LoadedChatSession {
  id: string;
  title: string;
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
}

export function useChatSessions({
  isAuthenticated,
  onLoad,
  onDeleted,
}: {
  isAuthenticated: boolean;
  onLoad: (session: LoadedChatSession) => void;
  onDeleted: (sessionId: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const fetchSessions = async () => {
    if (!isAuthenticated) return;
    setIsLoadingSessions(true);
    try {
      const res = await apiClient.get<ChatSessionSummary[]>("/api/ai/sessions");
      if (res.data) setSessions(res.data);
    } catch {
      // silently fail
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await apiClient.get<LoadedChatSession>(`/api/ai/sessions/${sessionId}`);
      if (!res.data) return;
      onLoad(res.data);
      setShowHistory(false);
    } catch {
      // silently fail
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/api/ai/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      onDeleted(sessionId);
    } catch {
      // silently fail
    }
  };

  const toggleHistory = () => {
    if (!showHistory) void fetchSessions();
    setShowHistory((v) => !v);
  };

  return { showHistory, setShowHistory, toggleHistory, sessions, isLoadingSessions, loadSession, deleteSession };
}
