import { useState } from "react";
import { X, Brain, Info, Code, Plus, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAI } from "@/lib/ai-context";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAiLabels } from "@/lib/utils/use-ai-labels";
import { AIUsageLimitBanner } from "@/components/AIUsageLimitBanner";
import AIChatThread from "@/components/ai-chat/AIChatThread";
import { useAIChatThread } from "@/components/ai-chat/useAIChatThread";

/**
 * Global AI CHRO slide-over. Owns only its chrome (backdrop, header,
 * usage banner, SuperAdmin context inspector); the conversation itself is
 * the shared `useAIChatThread` + `<AIChatThread/>` pair that embedded
 * surfaces (the Studio editor's AI tab) mount too — one implementation.
 */
export default function AIChatPanel() {
  const { t } = useTranslation();
  const { isAIChatOpen, closeAIChat, pageContext } = useAI();
  const isMobile = useIsMobile();
  const isSuperAdmin = isSuperAdminFromToken();
  const { contextLabel, actionLabel } = useAiLabels();
  const thread = useAIChatThread({
    active: isAIChatOpen,
    consumePendingMessage: true,
    syncRouteContext: true,
  });
  const [showContextInfo, setShowContextInfo] = useState(false);
  const [useOrchestration, setUseOrchestration] = useState(true);

  return (
    <div
      data-print-hide
      className={cn(
        "fixed inset-0 z-50 flex transition-opacity duration-500 ease-in-out print:hidden",
        isAIChatOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "flex-1 cursor-pointer touch-manipulation bg-black/20 backdrop-blur-sm",
          isMobile && "bg-black/30",
        )}
        onClick={closeAIChat}
        onTouchEnd={closeAIChat}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden border-l bg-background shadow-2xl transition-all duration-500 ease-in-out",
          isAIChatOpen ? "translate-x-0" : "translate-x-full",
          isMobile ? "w-[90%]" : "w-[60%] max-w-2xl",
        )}
      >
        {/* Header */}
        <div className={cn("flex items-center justify-between border-b bg-card", isMobile ? "p-3" : "p-4")}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                {t("aiChat.title", "AI CHRO")}
                {pageContext && (
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {contextLabel(pageContext.contextType)}
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {pageContext
                  ? t("aiChat.subtitle.stats", "{{apis}} APIs available • {{actions}} actions", {
                      apis: pageContext.availableAPIs.length,
                      actions: pageContext.availableActions.length,
                    })
                  : t("aiChat.subtitle.default", "Always here to help")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={thread.startNewChat}
              title={t("aiChat.newChat", "New chat")}
              aria-label={t("aiChat.newChat", "New chat")}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={thread.toggleHistory}
              title={t("aiChat.chatHistory", "Chat history")}
              aria-label={t("aiChat.chatHistory", "Chat history")}
              className={cn(thread.showHistory && "bg-muted")}
            >
              <History className="h-4 w-4" />
            </Button>
            {/* Page-context debug panel is a staff diagnostic — SuperAdmin only. */}
            {pageContext && isSuperAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowContextInfo(!showContextInfo)}
                title={t("aiChat.toggleContextInfo", "Toggle context info")}
                aria-label={t("aiChat.toggleContextInfo", "Toggle context info")}
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeAIChat}
              aria-label={t("actions.close")}
              className={cn("touch-manipulation", isMobile && "min-h-[44px] min-w-[44px]")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {thread.isAuthenticated && <AIUsageLimitBanner />}

        {showContextInfo && pageContext && (
          <div className="space-y-3 border-b bg-muted/50 p-4">
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Code className="h-4 w-4" />
                {t("aiChat.context.pageContext", "Page Context")}
              </h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("aiChat.context.type", "Type:")}</span>
                  <span className="rounded bg-background px-2 py-0.5 font-mono">{pageContext.contextType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("aiChat.context.url", "URL:")}</span>
                  <span className="truncate font-mono text-xs">{pageContext.pageUrl}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">{t("aiChat.context.availableActions", "Available Actions")}</h4>
              <div className="flex flex-wrap gap-1">
                {pageContext.availableActions.map((action) => (
                  <span key={action} className="rounded-full bg-background px-2 py-1 text-xs">
                    {actionLabel(action)}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                {t("aiChat.context.availableApis", "Available APIs ({{count}})", {
                  count: pageContext.availableAPIs.length,
                })}
              </h4>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {pageContext.availableAPIs.map((api) => (
                  <div key={api.id} className="flex items-start gap-2 rounded bg-background p-2 text-xs">
                    <span className="font-mono text-[10px] text-muted-foreground">{api.method}</span>
                    <div className="flex-1">
                      <div className="font-mono text-[10px]">{api.endpoint}</div>
                      <div className="text-muted-foreground">{api.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t pt-2">
              <input
                type="checkbox"
                id="useOrchestration"
                checked={useOrchestration}
                onChange={(e) => setUseOrchestration(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="useOrchestration" className="cursor-pointer text-xs">
                {t("aiChat.context.useOrchestration", "Use API Orchestration")}
              </label>
            </div>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <AIChatThread thread={thread} variant="panel" />
        </div>
      </div>
    </div>
  );
}
