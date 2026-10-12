/**
 * FocusAiTab — the editor's AI tab: the shared AI chat thread (same
 * implementation as the global AI panel; studio_* tools drive this editor
 * through the editor bridge) plus the kind's generator (AI prompt +
 * Generate, or the 3D world agent) behind a Chat | Generate switch. In the
 * composer, the format's AI tools as chips — the same registry and the same
 * slot as the kit's Chat (lib/workspace/chat-actions.ts): a prompt goes into
 * the thread, "Create an image" opens the generator inline above the
 * composer (ChatGeneratorPanel, as on a kit).
 */
import { useState, type ReactNode } from "react";
import { History, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AIChatThread from "@/components/ai-chat/AIChatThread";
import { useAIChatThread } from "@/components/ai-chat/useAIChatThread";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import type { StudioToolFamily } from "@/lib/workspace/studio-tool-slots";
import type { ChatActionHandlers } from "@/lib/workspace/use-chat-actions";
import ChatActionChips from "@/components/workspace/ChatActionChips";
import ChatGeneratorPanel from "@/components/workspace/ChatGeneratorPanel";
import SegmentToggle from "./SegmentToggle";

type AiMode = "chat" | "generate";

export default function FocusAiTab({
  active,
  generate,
  family,
}: {
  active: boolean;
  generate?: ReactNode;
  /** The format's tool family — which AI tools its chips offer. */
  family?: StudioToolFamily;
}) {
  const { t } = useTranslation();
  // Sync the route context too, so studio_* tool guidance is present even
  // when the global panel (GlobalChrome) is not mounted.
  const thread = useAIChatThread({ active, syncRouteContext: true });
  const [mode, setMode] = useState<AiMode>("chat");
  const showChat = !generate || mode === "chat";
  // The chat's "Create an image" action: the generator inline above the composer.
  const [generating, setGenerating] = useState(false);
  const handlers: ChatActionHandlers = {
    prompt: (text) => void thread.sendMessage(text),
    generate: () => setGenerating(true),
    // A catalog tool opens its own page beside the editor (nothing unsaved is left).
    tool: (toolId) => {
      const href = TOOLS_CATALOG.find((entry) => entry.id === toolId)?.href;
      if (href) window.open(href, "_blank", "noopener");
    },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
        {generate ? (
          <div className="flex-1">
            <SegmentToggle<AiMode>
              ariaLabel={t("studio.focus.ai.mode")}
              value={mode}
              onChange={setMode}
              options={[
                { id: "chat", label: t("studio.focus.ai.chat") },
                { id: "generate", label: t("studio.focus.ai.generate") },
              ]}
            />
          </div>
        ) : (
          <span className="flex-1 px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {t("aiChat.title", "AI CHRO")}
          </span>
        )}
        {showChat && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={thread.startNewChat}
              aria-label={t("aiChat.newChat", "New chat")}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={thread.toggleHistory}
              aria-label={t("aiChat.chatHistory", "Chat history")}
              aria-pressed={thread.showHistory}
            >
              <History className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      <div hidden={!showChat} className={cn("relative min-h-0 flex-1 flex-col", showChat ? "flex" : "hidden")}>
        <AIChatThread
          thread={thread}
          variant="embedded"
          showImageChip={false}
          composerChips={
            family ? (
              <ChatActionChips
                context={{ surface: "studio", family, can: { generate: !!generate } }}
                handlers={handlers}
                disabled={thread.isTyping}
              />
            ) : undefined
          }
          aboveComposer={generating && generate ? <ChatGeneratorPanel onClose={() => setGenerating(false)}>{generate}</ChatGeneratorPanel> : undefined}
        />
      </div>
      {generate && (
        <div hidden={showChat} className={cn("min-h-0 flex-1 overflow-y-auto", showChat && "hidden")}>
          {generate}
        </div>
      )}
    </div>
  );
}
