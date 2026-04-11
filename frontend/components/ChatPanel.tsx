/**
 * ChatPanel — globally-mounted LinkedIn-style mini chat windows.
 *
 * No longer renders its own conversation list / "Messaging" button — the
 * unified CommunicationHub in the header is now the single entry point.
 * This component is purely the passive renderer of open conversation
 * mini-windows; it listens on `chatBus` for "open conversation X" events.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { communicationService } from "@/lib/services/communication-service";
import { useAuth } from "@/lib/auth";
import { chatBus } from "@/lib/chat-bus";
import type { ConversationListItem, MessageListItem } from "@/types/communication";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenChat {
  conversation: ConversationListItem;
  messages: MessageListItem[];
  loading: boolean;
  minimized: boolean;
  newMessage: string;
  sending: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Mini chat window ─────────────────────────────────────────────────────────

function ChatWindow({
  chat,
  onClose,
  onToggleMinimize,
  onSend,
  onMessageChange,
}: {
  chat: OpenChat;
  onClose: () => void;
  onToggleMinimize: () => void;
  onSend: () => void;
  onMessageChange: (val: string) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!chat.minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages, chat.minimized]);

  return (
    <div
      className="flex flex-col bg-card border rounded-t-xl shadow-xl overflow-hidden"
      style={{ width: 300, height: chat.minimized ? "auto" : 360 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-card border-b cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {getInitials(chat.conversation.title)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm truncate">{chat.conversation.title}</span>
          {(chat.conversation.unreadCount ?? 0) > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
              {chat.conversation.unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {chat.minimized ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-0.5 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Body — hidden when minimized */}
      {!chat.minimized && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {chat.loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chat.messages.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-4">
                No messages yet. Say hello!
              </p>
            ) : (
              chat.messages.map((msg) => {
                const isMe = msg.isOwn;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card border rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t bg-card">
            <Input
              value={chat.newMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Write a message..."
              className="h-8 text-sm rounded-full"
              disabled={chat.sending}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={!chat.newMessage.trim() || chat.sending}
              className="p-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition-opacity hover:opacity-90"
            >
              {chat.sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main ChatPanel ────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { isAuthenticated } = useAuth();
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  // Mirror of openChats keyed by conversation id, used inside async callbacks
  // so we can read the latest state without depending on stale closures.
  const openIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    openIdsRef.current = new Set(openChats.map((c) => c.conversation.id));
  }, [openChats]);

  /** Open a conversation by id. Looks it up via the API, since the hub
   *  passes only the id over the bus. Dedupes against already-open windows. */
  const openConversationById = useCallback(async (convId: string) => {
    if (openIdsRef.current.has(convId)) {
      // Already open — just un-minimise.
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === convId ? { ...c, minimized: false } : c,
        ),
      );
      return;
    }

    // Fetch the conversation row so we have a title for the window header.
    let conversation: ConversationListItem | undefined;
    try {
      const convs = await communicationService.getConversations();
      conversation = convs.find((c) => c.id === convId);
    } catch {
      /* fall through with placeholder */
    }
    if (!conversation) {
      conversation = {
        id: convId,
        title: "Conversation",
        type: 0 as ConversationListItem["type"],
        participantCount: 0,
        unreadCount: 0,
        isArchived: false,
        isMuted: false,
      };
    }

    const chat: OpenChat = {
      conversation,
      messages: [],
      loading: true,
      minimized: false,
      newMessage: "",
      sending: false,
    };
    // Cap at 3 open windows.
    setOpenChats((prev) => [...prev.slice(-2), chat]);

    try {
      const msgs = await communicationService.getMessages(convId);
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === convId ? { ...c, messages: msgs, loading: false } : c,
        ),
      );
    } catch {
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === convId ? { ...c, loading: false } : c,
        ),
      );
    }
  }, []);

  // Subscribe to the chat-bus so the CommunicationHub can ask us to open a
  // conversation without needing a React context dependency.
  useEffect(() => {
    if (!isAuthenticated) return;
    return chatBus.subscribe((convId) => {
      void openConversationById(convId);
    });
  }, [isAuthenticated, openConversationById]);

  const closeChat = useCallback((convId: string) => {
    setOpenChats((prev) => prev.filter((c) => c.conversation.id !== convId));
  }, []);

  const toggleMinimize = useCallback((convId: string) => {
    setOpenChats((prev) =>
      prev.map((c) =>
        c.conversation.id === convId ? { ...c, minimized: !c.minimized } : c,
      ),
    );
  }, []);

  const handleMessageChange = useCallback((convId: string, val: string) => {
    setOpenChats((prev) =>
      prev.map((c) => (c.conversation.id === convId ? { ...c, newMessage: val } : c)),
    );
  }, []);

  const openChatsRef = useRef<OpenChat[]>([]);
  useEffect(() => {
    openChatsRef.current = openChats;
  }, [openChats]);

  const sendMessage = useCallback(async (convId: string) => {
    const pending = openChatsRef.current.find((c) => c.conversation.id === convId);
    if (!pending || !pending.newMessage.trim()) return;

    setOpenChats((prev) =>
      prev.map((c) => (c.conversation.id === convId ? { ...c, sending: true } : c)),
    );

    try {
      const msg = await communicationService.sendMessage({
        conversationId: convId,
        content: pending.newMessage.trim(),
      });
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === convId
            ? { ...c, messages: [...c.messages, msg as unknown as MessageListItem], newMessage: "", sending: false }
            : c,
        ),
      );
    } catch {
      setOpenChats((prev) =>
        prev.map((c) => (c.conversation.id === convId ? { ...c, sending: false } : c)),
      );
    }
  }, []);

  if (!isAuthenticated || openChats.length === 0) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 right-4 z-40 flex items-end gap-3">
      {openChats.map((chat) => (
        <ChatWindow
          key={chat.conversation.id}
          chat={chat}
          onClose={() => closeChat(chat.conversation.id)}
          onToggleMinimize={() => toggleMinimize(chat.conversation.id)}
          onSend={() => sendMessage(chat.conversation.id)}
          onMessageChange={(val) => handleMessageChange(chat.conversation.id, val)}
        />
      ))}
    </div>
  );
}
