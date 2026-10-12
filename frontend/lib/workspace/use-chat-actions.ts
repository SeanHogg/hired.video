/**
 * useChatActions — the registry's actions for a chat (chat-actions.ts),
 * localized and ready to render as chips; `runChatAction` hands one to the
 * host's handlers. The host only says HOW each kind runs on its surface
 * (the kit: its tool runner / revise chat / frame; the studio: its AI
 * thread / Generate tab) — which actions exist is the registry's business.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";
import { stageToolMode } from "@/lib/build/stage-tools";
import { chatActionsFor, type ChatActionContext, type ChatActionDef, type ChatActionRun } from "./chat-actions";

export interface ResolvedChatAction {
  id: string;
  label: string;
  icon: ChatActionDef["icon"];
  /** A Pro AI Tool (the badge only — the gate is the tool's own). */
  pro: boolean;
  /** Opens a page in the slide-out rather than running in the chat. */
  opensPanel: boolean;
  run: ChatActionRun;
}

export interface ChatActionHandlers {
  tool: (toolId: string) => void;
  prompt: (text: string) => void;
  generate: (media: "image") => void;
}

function resolve(action: ChatActionDef, t: TFunction): ResolvedChatAction {
  const base = { id: action.id, icon: action.icon, run: action.run };
  if (action.run.kind === "tool") {
    const { toolId } = action.run;
    const entry = TOOLS_CATALOG.find((e) => e.id === toolId);
    const title = entry ? localizeTool(entry, t).title : t(action.labelKey);
    return { ...base, label: title, pro: entry?.tier === "pro", opensPanel: stageToolMode(toolId) === "panel" };
  }
  return { ...base, label: t(action.labelKey), pro: false, opensPanel: false };
}

export function useChatActions(ctx: ChatActionContext): ResolvedChatAction[] {
  const { t } = useTranslation();
  // Keyed on the context's values, not its identity (callers build it inline).
  const key = JSON.stringify(ctx);
  return useMemo(
    () => chatActionsFor(JSON.parse(key) as ChatActionContext).map((action) => resolve(action, t)),
    [key, t],
  );
}

/** Run an action through the host's handler for its kind. */
export function runChatAction(run: ChatActionRun, handlers: ChatActionHandlers, t: TFunction): void {
  switch (run.kind) {
    case "tool":
      handlers.tool(run.toolId);
      return;
    case "prompt":
      handlers.prompt(t(run.promptKey));
      return;
    case "generate":
      handlers.generate(run.media);
      break;
  }
}
