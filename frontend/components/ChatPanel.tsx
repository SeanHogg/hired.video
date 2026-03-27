/**
 * ChatPanel — LinkedIn-style fixed footer messaging panel.
 * Shows a "Messaging" button that expands a conversation list,
 * and supports opening individual mini chat windows.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageCircle,
  X,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  Pencil,
  Search,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { communicationService } from "@/lib/services/communication-service";
import { useAuth } from "@/lib/auth";
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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
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

  const [panelOpen, setPanelOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);

  // Load conversations when panel opens
  useEffect(() => {
    if (panelOpen && conversations.length === 0 && isAuthenticated) {
      setLoadingConvs(true);
      communicationService
        .getConversations()
        .then(setConversations)
        .catch(() => {})
        .finally(() => setLoadingConvs(false));
    }
  }, [panelOpen, isAuthenticated, conversations.length]);

  const openChat = useCallback(async (conv: ConversationListItem) => {
    // Don't open duplicate
    if (openChats.some((c) => c.conversation.id === conv.id)) {
      // Un-minimise if it's there
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === conv.id ? { ...c, minimized: false } : c,
        ),
      );
      setPanelOpen(false);
      return;
    }

    const chat: OpenChat = {
      conversation: conv,
      messages: [],
      loading: true,
      minimized: false,
      newMessage: "",
      sending: false,
    };
    setOpenChats((prev) => [...prev.slice(-2), chat]); // max 3 open
    setPanelOpen(false);

    try {
      const msgs = await communicationService.getMessages(conv.id);
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === conv.id ? { ...c, messages: msgs, loading: false } : c,
        ),
      );
    } catch {
      setOpenChats((prev) =>
        prev.map((c) =>
          c.conversation.id === conv.id ? { ...c, loading: false } : c,
        ),
      );
    }
  }, [openChats]);

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

  const sendMessage = useCallback(async (convId: string) => {
    const chat = openChats.find((c) => c.conversation.id === convId);
    if (!chat || !chat.newMessage.trim()) return;

    setOpenChats((prev) =>
      prev.map((c) => (c.conversation.id === convId ? { ...c, sending: true } : c)),
    );

    try {
      const msg = await communicationService.sendMessage({
        conversationId: convId,
        content: chat.newMessage.trim(),
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
  }, [openChats]);

  if (!isAuthenticated) return null;

  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalUnread = openChats.reduce((acc, c) => acc + (c.conversation.unreadCount ?? 0), 0);

  return (
    <div className="fixed bottom-0 right-4 z-40 flex items-end gap-3">
      {/* Open chat windows */}
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

      {/* Messaging panel */}
      <div className="flex flex-col" style={{ width: 300 }}>
        {/* Conversation list */}
        {panelOpen && (
          <div className="bg-card border rounded-t-xl shadow-xl overflow-hidden mb-0" style={{ maxHeight: 420 }}>
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">Messaging</span>
              <div className="flex items-center gap-1">
                <button type="button" className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors" title="New message">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setPanelOpen(false)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages"
                  className="h-8 pl-8 text-sm rounded-full"
                />
              </div>
            </div>

            {/* Conversations list */}
            <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
              {loadingConvs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredConvs.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect with people to start messaging
                  </p>
                </div>
              ) : (
                filteredConvs.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => openChat(conv)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="text-sm bg-primary/10 text-primary">
                          {getInitials(conv.title)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{conv.title}</span>
                        {conv.lastMessage && (
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {timeAgo(conv.lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.lastMessage.content}
                        </p>
                      )}
                    </div>
                    {(conv.unreadCount ?? 0) > 0 && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4 shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Messaging tab button */}
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center justify-between px-4 py-2.5 bg-card border border-b-0 rounded-t-xl shadow-lg hover:bg-muted/50 transition-colors w-full"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Messaging</span>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
                {totalUnread}
              </Badge>
            )}
          </div>
          {panelOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}
