/**
 * A tool page running INSIDE another page (the kit stage tools open in a
 * slide-out over the résumé) instead of at its own /tools/* route.
 *
 * The host provides the résumé the tool works on and where its hand-offs go,
 * so the same tool page works in both places with no per-tool branches:
 *   - ToolShell drops the page chrome (AppShell, SEO, breadcrumbs, footer);
 *   - useToolEntityParams binds the tool's résumé picker to `resumeId`;
 *   - "ask the AI" goes to the host's own chat (useAskAssistant), never a
 *     second chat panel on top of it;
 *   - a review hand-off opens on the host page (useOpenReview) instead of
 *     navigating to a kit that is already open;
 *   - a finished run is saved on the host's résumé + session and reported
 *     to the host (useToolRunRecorder), so its result lands in the host's
 *     own log (the kit chat + stage status) and survives a reload.
 */
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useAI } from "@/lib/ai-context";
import type { AIContext as AIContextData } from "@/lib/types/ai-context";
import type { ReviewHandoff } from "@/lib/build/review/use-review-handoff";
import type { NormalizedToolRunResult } from "@/lib/tools/types";

export interface ToolEmbed {
  /** The saved résumé the host has open. */
  resumeId: string;
  /** The host's studio session (/studio/<id>) a run is kept on, once known. */
  projectId: string | null;
  /** Send a message to the host's chat. */
  ask: (message: string) => void;
  /** Open a review (merge / tailor / create-for-job) on the host's résumé. */
  openReview: (handoff: ReviewHandoff) => void;
  /** A run of `toolId` finished with `result` (saved as `savedId`, or null). */
  report: (toolId: string, result: NormalizedToolRunResult, savedId: string | null) => void;
}

const ToolEmbedContext = createContext<ToolEmbed | null>(null);

export function ToolEmbedProvider({ value, children }: { value: ToolEmbed; children: ReactNode }) {
  return <ToolEmbedContext.Provider value={value}>{children}</ToolEmbedContext.Provider>;
}

/** The host, when this tool is embedded; null on the tool's own page. */
export function useToolEmbed(): ToolEmbed | null {
  return useContext(ToolEmbedContext);
}

/**
 * "Ask the AI" from a tool: the host's chat when embedded, otherwise the
 * global AI panel (with page context when given).
 */
export function useAskAssistant(): (message: string, context?: AIContextData) => void {
  const embed = useToolEmbed();
  const { openAIWithMessage, openAIWithPageContextAndMessage } = useAI();
  return useCallback(
    (message: string, context?: AIContextData) => {
      if (embed) embed.ask(message);
      else if (context) openAIWithPageContextAndMessage(context, message);
      else openAIWithMessage(message);
    },
    [embed, openAIWithMessage, openAIWithPageContextAndMessage],
  );
}
