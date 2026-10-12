/**
 * useStartConversation — single source of truth for "open a chat with
 * user X". Every "Message" affordance in the app (profile page, people
 * card menu, search result, mention pill) calls this hook so:
 *
 *   • The find-or-create dedupe rule lives in one place (the backend
 *     service does the work; the hook just wires the call).
 *   • The chatBus.open handoff happens identically every time.
 *   • Loading + error toast UX is consistent — no "Message" button
 *     anywhere has to remember to await the request and show feedback.
 *
 * Consumers should NOT compute "can I message this user" in the parent
 * and prop-drill it down. The hook returns `start(userId)`; if the
 * caller is unauthenticated or messaging is disabled the hook itself
 * is a no-op that toasts an explanation, so the call site just calls
 * the function unconditionally.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConversationType } from "@/types/communication";
import { communicationService } from "@/lib/services/communication-service";
import { chatBus } from "@/lib/chat-bus";
import { useApiReady, useAuth } from "@/lib/auth";

export interface UseStartConversationReturn {
  /** Open a direct conversation with the target user, creating one if
   *  it doesn't exist yet, and pop it open in the global ChatPanel. */
  start: (otherUserId: string, opts?: { initialMessage?: string }) => Promise<void>;
  /** True while the create/open round-trip is in flight; consumers can
   *  use this to disable the trigger button and avoid double-clicks. */
  isStarting: boolean;
}

export function useStartConversation(): UseStartConversationReturn {
  const { user } = useAuth();
  const apiReady = useApiReady();
  const [isStarting, setIsStarting] = useState(false);

  const start = useCallback(
    async (otherUserId: string, opts?: { initialMessage?: string }) => {
      if (!apiReady) {
        toast.error("Sign in to start conversations");
        return;
      }
      if (!otherUserId || otherUserId === user?.id) return;

      setIsStarting(true);
      try {
        const conversation = await communicationService.createConversation({
          type: ConversationType.Direct,
          participantUserIds: [otherUserId],
          initialMessage: opts?.initialMessage,
        });
        chatBus.open(conversation.id);
      } catch (err) {
        console.error("[useStartConversation] failed:", err);
        toast.error("Couldn't open chat. Try again.");
      } finally {
        setIsStarting(false);
      }
    },
    [apiReady, user?.id],
  );

  return { start, isStarting };
}
