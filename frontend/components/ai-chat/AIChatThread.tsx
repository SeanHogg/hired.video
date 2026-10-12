/**
 * AIChatThread — the shared chat body (history overlay, message list, tool
 * cards, quick suggestions, composer) driven by `useAIChatThread`. Mounted
 * by the global <AIChatPanel/> slide-over and by embedded surfaces (the
 * Studio editor's AI tab). The parent must be `relative` so the history
 * overlay covers it, and give the thread a bounded height (flex column).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Brain,
  Check,
  ChevronLeft,
  Copy,
  HelpCircle,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AIInputBox } from "@/components/AIInputBox";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import Markdown from "@/components/Markdown";
import { AIUsageLimitErrorBanner } from "@/components/AIUsageLimitBanner";
import { cn } from "@/lib/utils";
import { persistGeneratedImage } from "@/lib/studio/media-persistence";
import type { AIChatThreadState } from "./useAIChatThread";

const BUILDERFORCE_URL = "https://builderforce.ai";

/** "Powered by BuilderForce.ai" caption under the composer. */
function AIFooterCaption() {
  const { t } = useTranslation();
  return (
    <>
      {t("aiChat.poweredByPrefix", "Powered by")}{" "}
      <a
        href={BUILDERFORCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2 hover:text-foreground"
      >
        BuilderForce.ai
      </a>
    </>
  );
}

/** Slide-over panel: both sides in bubbles. */
function bubblePanel(isUser: boolean): string {
  return cn("max-w-[80%] rounded-lg p-3", isUser ? "bg-primary text-primary-foreground" : "bg-muted");
}

/** Embedded studio tab: dark "ink" user bubble with a tucked corner; AI replies as plain text. */
function bubbleEmbedded(isUser: boolean): string {
  return isUser
    ? "max-w-[85%] rounded-[12px_12px_4px_12px] bg-ink px-3 py-2 leading-[1.45] text-ink-foreground"
    : "max-w-full leading-normal";
}

export interface AIChatThreadProps {
  thread: AIChatThreadState;
  /** "panel" = roomy slide-over; "embedded" = narrow side tab (tighter padding, one-column chips). */
  variant?: "panel" | "embedded";
  /** Show the Studio "Generate image" chip above the composer (Studio context + signed in). */
  showImageChip?: boolean;
  /** A workspace chat's action chips (<li>s, ChatActionChips) — in the
   *  composer, ahead of the input, the same slot as the kit's composer. */
  composerChips?: ReactNode;
  /** An inline panel just above the composer (ChatGeneratorPanel). */
  aboveComposer?: ReactNode;
}

export default function AIChatThread({ thread, variant = "panel", showImageChip = true, composerChips, aboveComposer }: AIChatThreadProps) {
  const { t } = useTranslation();
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const embedded = variant === "embedded";
  const pad = embedded ? "p-3" : "p-4";
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages, thread.isTyping]);

  return (
    <>
      {thread.showHistory && (
        <div className="absolute inset-0 z-10 flex flex-col bg-background">
          <div className={cn("flex items-center gap-2 border-b", pad)}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => thread.setShowHistory(false)}
              aria-label={t("actions.back")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h4 className="flex-1 text-sm font-semibold">{t("aiChat.history.title", "Chat History")}</h4>
            <Button variant="ghost" size="sm" onClick={thread.startNewChat} className="gap-1 text-xs">
              <Plus className="h-3 w-3" />
              {t("aiChat.history.newChat", "New Chat")}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {thread.isLoadingSessions ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("status.loading", "Loading…")}</div>
            ) : thread.sessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p>{t("aiChat.history.empty", "No previous chats")}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {thread.sessions.map((session) => (
                  <li key={session.id} className="group flex items-start gap-1">
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-11 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted",
                        thread.currentSessionId === session.id && "bg-muted",
                      )}
                      onClick={() => void thread.loadSession(session.id)}
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{session.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(session.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-2 mt-2 h-8 w-8 flex-shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => void thread.deleteSession(session.id)}
                      aria-label={t("aiChat.deleteChat", "Delete chat")}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div
        className={cn("min-h-0 flex-1 overflow-y-auto", pad)}
        ref={scrollRef}
      >
        <div className="space-y-4">
          {thread.messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.sender === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "group relative text-sm",
                  embedded ? bubbleEmbedded(message.sender === "user") : bubblePanel(message.sender === "user"),
                )}
              >
                {message.sender === "ai" && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Brain className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">{t("aiChat.title", "AI CHRO")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void thread.copyMessage(message.id, message.content)}
                      className="rounded p-1 opacity-0 transition-opacity hover:bg-background focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={t("aiChat.copyResponse", "Copy response")}
                    >
                      {thread.copiedMessageId === message.id ? (
                        <Check className="h-3 w-3 text-brand-green" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )}
                {message.sender === "ai" ? (
                  <Markdown>{message.content}</Markdown>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
                {message.toolRuns && message.toolRuns.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.toolRuns.map((run) => (
                      <ToolCallCard
                        key={run.toolCallId}
                        toolId={run.toolId}
                        result={run.result}
                        onResultChange={(next) => thread.updateToolRun(message.id, run.toolCallId, next)}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-1 text-xs opacity-70">
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}

          {thread.isTyping && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted p-3 text-sm" role="status" aria-live="polite">
                <div className="mb-2 flex items-center gap-2">
                  <Brain className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium text-primary">{t("aiChat.assistant", "AI Assistant")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {thread.rateLimitError && (
        <div className={cn(embedded ? "px-3" : "px-4", "py-2")}>
          <AIUsageLimitErrorBanner
            message={thread.rateLimitError.message}
            used={thread.rateLimitError.used}
            limit={thread.rateLimitError.limit}
            upgradeUrl={thread.rateLimitError.upgradeUrl}
            onDismiss={thread.dismissRateLimit}
          />
        </div>
      )}

      {thread.messages.length <= 1 && (
        <div className={cn("border-t bg-muted/30", pad)}>
          <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            {thread.pageContext ? (
              <>
                <Sparkles className="h-3 w-3" />
                {t("aiChat.suggestions.contextAware", "Context-aware suggestions:")}
              </>
            ) : (
              t("aiChat.suggestions.quick", "Quick suggestions:")
            )}
          </p>
          <div className={cn("grid gap-2", embedded ? "grid-cols-1" : "grid-cols-2")}>
            {thread.quickSuggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 justify-start p-2 text-left"
                  onClick={() => thread.sendSuggestion(suggestion.text, suggestion.action)}
                >
                  <Icon className="mr-2 h-3 w-3 shrink-0" />
                  <span className="text-xs">{suggestion.text}</span>
                </Button>
              );
            })}
          </div>
          {/* Context help folded into the Brain (#2232). */}
          {thread.contextHelp.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <HelpCircle className="h-3 w-3" />
                {t("aiChat.help.forThisPage", "Help with this page:")}
              </p>
              <div className="flex flex-col gap-1">
                {thread.contextHelp.slice(0, 4).map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => void thread.sendMessage(item.title)}
                    className="rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {aboveComposer}
      {/* Composer — available to everyone; signed-out visitors get help-center answers. */}
      <div className={cn("border-t", pad)}>
        {composerChips && (
          <ul aria-label={t("workspace.chatAction.label")} className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 empty:hidden">
            {composerChips}
          </ul>
        )}
        {showImageChip && thread.isAuthenticated && thread.pageContext?.contextType === "studio" && (
          <div className="mb-2 flex items-center gap-2">
            <Popover open={imagePromptOpen} onOpenChange={setImagePromptOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span className="text-xs">{t("aiChat.generateImage", "Generate image")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-80 p-0">
                <MediaAiPromptPanel
                  compact
                  kindNoun="image"
                  placeholder={t("aiChat.imagePlaceholder", "A clean studio backdrop, soft warm lighting…")}
                  onGenerated={async (result, prompt) => {
                    const imageUrl = await persistGeneratedImage(result);
                    setImagePromptOpen(false);
                    thread.appendGeneratedImage(imageUrl, result.mode, prompt);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
        <AIInputBox
          onSubmit={(v) => void thread.sendMessage(v)}
          disabled={thread.isTyping}
          placeholder={t("aiChat.inputPlaceholder", "Ask me anything about hiring, jobs, or how to use the platform…")}
          helpText={<AIFooterCaption />}
        />
        {!thread.isAuthenticated && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("aiChat.anonHint", "Answering from our help center.")}{" "}
            <Link to="/login" className="underline underline-offset-2 hover:text-foreground">
              {t("actions.signIn", "Sign in")}
            </Link>{" "}
            {t("aiChat.anonHintRest", "for full AI help — 10 free requests/month.")}
          </p>
        )}
      </div>
    </>
  );
}
