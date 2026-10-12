/**
 * One AI Tool run in the kit chat: "Running …" while it works, then its
 * result as a card (ToolCallCard, which also offers Apply for a tool that
 * proposes a change), or why it didn't finish.
 */
import { useTranslation } from "react-i18next";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import { useToolTitle } from "@/lib/tools/localize-tool";
import type { ToolRun } from "@/lib/build/use-tool-runs";
import ConversationBubble from "./ConversationBubble";

export default function ToolRunMessage({ run }: { run: ToolRun }) {
  const { t } = useTranslation();
  const title = useToolTitle()(run.toolId);
  if (run.status === "done") return <ToolCallCard toolId={run.toolId} result={run.result} />;
  return (
    <ConversationBubble from="assistant">
      {run.status === "running" ? (
        <span aria-live="polite">{t("build.tools.running", { tool: title })}</span>
      ) : (
        <span role="alert">
          {t("build.tools.failed", { tool: title })}
          {run.message ? ` ${run.message}` : ""}
        </span>
      )}
    </ConversationBubble>
  );
}
