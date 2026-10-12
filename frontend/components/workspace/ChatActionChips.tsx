/**
 * ChatActionChips — the AI work a workspace chat offers, as chips: the open
 * kit stage's résumé tools and the studio's AI tools, from ONE registry
 * (lib/workspace/chat-actions.ts). Renders <li>s for the host composer's chip
 * row — the SAME slot on every chat (the kit's BuildComposer, the studio's
 * AIChatThread `composerChips`). A Pro tool says so before you click; one
 * that opens a page shows the slide-out icon.
 */
import { useTranslation } from "react-i18next";
import { PanelRight } from "lucide-react";
import type { ChatActionContext } from "@/lib/workspace/chat-actions";
import { runChatAction, useChatActions, type ChatActionHandlers } from "@/lib/workspace/use-chat-actions";
import ProTag from "@/components/build/ProTag";

interface ChatActionChipsProps {
  context: ChatActionContext;
  handlers: ChatActionHandlers;
  disabled?: boolean;
}

export default function ChatActionChips({ context, handlers, disabled }: ChatActionChipsProps) {
  const { t } = useTranslation();
  const actions = useChatActions(context);
  // The chip's text names it; the icon is decoration.
  return (
    <>
      {actions.map((action) => (
        <li key={action.id} className="flex-none">
          <button
            type="button"
            disabled={disabled}
            aria-haspopup={action.opensPanel ? "dialog" : undefined}
            onClick={() => runChatAction(action.run, handlers, t)}
            className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary bg-card px-3 text-[13px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <action.icon className="h-3.5 w-3.5 flex-none" />
            {action.label}
            {action.pro && <ProTag />}
            {action.opensPanel && <PanelRight aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        </li>
      ))}
    </>
  );
}
