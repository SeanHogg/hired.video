/**
 * useChatRoom — single hook that owns the WebSocket lifecycle for a
 * conversation. Connects to /api/chat/socket/:conversationId, exposes
 * `send`, `sendTyping`, and reactive `messages` / `typingUsers` /
 * `presence` state. Reconnect-with-backoff on transient close.
 *
 * Consumers don't manage the socket directly — they just call
 * `useChatRoom(conversationId)`. The hook self-gates: when
 * `conversationId` is null/empty the hook is inert and the socket
 * stays closed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api/base-url";

export interface ChatRoomMessage {
  /** Client-side id used for keyed rendering. */
  id: string;
  body: string;
  sentAt: string;
  fromUserId: string;
  fromName: string;
}

interface IncomingMessage {
  kind: "message";
  body: string;
  sentAt: string;
  fromUserId: string;
  fromName: string;
}
interface IncomingTyping {
  kind: "typing";
  isTyping: boolean;
  fromUserId: string;
  fromName: string;
}
interface IncomingPresence {
  kind: "presence";
  online: string[];
}
type IncomingFrame = IncomingMessage | IncomingTyping | IncomingPresence;

export interface UseChatRoomState {
  status: "idle" | "connecting" | "open" | "closed";
  messages: ChatRoomMessage[];
  typingUsers: string[]; // userIds currently typing (excluding self)
  presence: string[];
  send: (body: string) => void;
  sendTyping: (isTyping: boolean) => void;
}

function buildSocketUrl(conversationId: string): string {
  // Same API host as every HTTP call (base-URL SSoT), upgraded to ws(s).
  return buildApiUrl(`/api/chat/socket/${conversationId}`).replace(/^http/, "ws");
}

export function useChatRoom(
  conversationId: string | null | undefined,
  /** Current viewer's userId — used to filter self out of typing state. */
  selfUserId: string | null | undefined,
): UseChatRoomState {
  const [status, setStatus] = useState<UseChatRoomState["status"]>("idle");
  const [messages, setMessages] = useState<ChatRoomMessage[]>([]);
  const [presence, setPresence] = useState<string[]>([]);
  const [typing, setTyping] = useState<Map<string, number>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedByConsumer = useRef(false);

  const send = useCallback((body: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ kind: "message", body }));
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ kind: "typing", isTyping }));
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setStatus("idle");
      return () => {};
    }
    closedByConsumer.current = false;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(buildSocketUrl(conversationId!));
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus("open");
      };
      ws.onmessage = (e) => {
        try {
          const frame = JSON.parse(typeof e.data === "string" ? e.data : "") as IncomingFrame;
          if (frame.kind === "message") {
            setMessages((prev) => [
              ...prev,
              {
                id: `${frame.fromUserId}-${frame.sentAt}-${prev.length}`,
                body: frame.body,
                sentAt: frame.sentAt,
                fromUserId: frame.fromUserId,
                fromName: frame.fromName,
              },
            ]);
          } else if (frame.kind === "typing") {
            setTyping((prev) => {
              const next = new Map(prev);
              if (frame.isTyping) next.set(frame.fromUserId, Date.now());
              else next.delete(frame.fromUserId);
              return next;
            });
          } else if (frame.kind === "presence") {
            setPresence(frame.online);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setStatus("closed");
        if (closedByConsumer.current) return;
        // Exponential backoff, capped at 30s.
        const delay = Math.min(30_000, 500 * 2 ** retryRef.current++);
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      closedByConsumer.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [conversationId]);

  // Decay typing indicators after 4s of silence so a dropped `typing:false`
  // frame doesn't leave the "X is typing…" affordance stuck on screen.
  useEffect(() => {
    if (typing.size === 0) return;
    const interval = setInterval(() => {
      setTyping((prev) => {
        const cutoff = Date.now() - 4000;
        const next = new Map<string, number>();
        for (const [k, v] of prev) if (v > cutoff) next.set(k, v);
        return next.size === prev.size ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [typing]);

  const typingUsers = useMemo(
    () => [...typing.keys()].filter((u) => u !== selfUserId),
    [typing, selfUserId],
  );

  return { status, messages, typingUsers, presence, send, sendTyping };
}
