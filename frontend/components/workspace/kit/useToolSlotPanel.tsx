/**
 * useToolSlotPanel — an AI Tool's own page (components/tools/tool-pages.ts)
 * as the right slot's 672px panel, embedded (tool-embed.tsx) so it works on
 * the résumé on screen: its reads and edits go through the open draft,
 * "ask the AI" goes to the kit's chat, and a review it starts opens on the
 * page. Either of those closes the panel so the answer or the review is in
 * view. A finished run is saved on the résumé and the kit's session
 * (`projectId`) and lands in the chat's log (`onResult`).
 */
import { Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toolPage } from "@/components/tools/tool-pages";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";
import { ToolEmbedProvider, type ToolEmbed } from "@/lib/tools/tool-embed";
import type { ReviewHandoff } from "@/lib/build/review/use-review-handoff";
import type { OpenTool } from "@/lib/build/use-tool-panel";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import type { SlotPanel } from "../RightSlot";

interface Args {
  tool: OpenTool | null;
  /** The kit's studio session, once it has one. */
  projectId: string | null;
  onClose: () => void;
  onAsk: (message: string) => void;
  onReview: (handoff: ReviewHandoff) => void;
  onResult: (toolId: string, result: NormalizedToolRunResult, savedId: string | null) => void;
}

export function useToolSlotPanel({ tool, projectId, onClose, onAsk, onReview, onResult }: Args): SlotPanel | null {
  const { t } = useTranslation();
  const entry = useMemo(() => {
    const found = tool ? TOOLS_CATALOG.find((e) => e.id === tool.toolId) : undefined;
    return found ? localizeTool(found, t) : null;
  }, [tool, t]);
  const Page = tool ? toolPage(tool.toolId) : null;
  const embed = useMemo<ToolEmbed | null>(
    () =>
      tool
        ? {
            resumeId: tool.resumeId,
            projectId,
            ask: (message) => {
              onClose();
              onAsk(message);
            },
            openReview: (handoff) => {
              onClose();
              onReview(handoff);
            },
            report: onResult,
          }
        : null,
    [tool, projectId, onClose, onAsk, onReview, onResult],
  );

  if (!entry || !Page || !embed) return null;
  return {
    kicker: t("workspace.slot.tool"),
    title: entry.title,
    description: entry.description,
    content: (
      <div className="min-w-0 px-4 py-5 sm:px-5">
        <ToolEmbedProvider value={embed}>
          <Suspense
            fallback={
              <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                {t("status.loading")}
              </div>
            }
          >
            <Page />
          </Suspense>
        </ToolEmbedProvider>
      </div>
    ),
  };
}
