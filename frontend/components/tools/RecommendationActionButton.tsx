// "Take action" button rendered next to each recommendation on the
// Resume Analysis page (Optimizer + Scorer). Self-gating: when the
// recommendation carries no structured wand action (#374), or no resume
// is bound, the component returns null — the parent doesn't pass a
// `canApply` boolean and doesn't need to know which recommendations are
// actionable.
//
// Direct dispatch (NOT routed through the AI Brain): clicking the
// button calls the registered tool's run() directly. The result —
// which is a `{ mutation: "pending", previewText, summary }` shape
// shared with the chat surface — is rendered through ToolCallCard so
// the Apply / Discard UX is identical regardless of which surface
// triggered the call. The same registry entries are exposed to the AI
// Brain via getCoachToolSpecs(), so anything the button can do, the
// chat can do via function-calling.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import { findWandForRecommendation, type RecommendationActionLike } from "@/lib/tools/find-wand-for-recommendation";
import { getTool } from "@/lib/tools/registry";
import type { NormalizedToolRunResult } from "@/lib/tools/types";

interface Props {
  recommendation: RecommendationActionLike;
  /** Active resume id. Required for any mutation tool — when undefined
   *  this component returns null (no apply target). */
  resumeId: string | undefined;
}

export function RecommendationActionButton({ recommendation, resumeId }: Props) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<NormalizedToolRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Self-gate: no resume bound → nothing to mutate.
  if (!resumeId) return null;

  const wand = findWandForRecommendation(recommendation);
  const tool = wand ? getTool(wand.toolId) : undefined;
  if (!wand || !tool) return null;

  async function handleClick() {
    if (!wand || !tool || !resumeId) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await tool.run({ bound: { resumeId }, args: wand.args }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("wands.failed"));
    } finally {
      setRunning(false);
    }
  }

  if (result) {
    return (
      <div className="mt-3">
        <ToolCallCard toolId={wand.toolId} result={result} onResultChange={(next) => setResult(next)} />
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={handleClick} disabled={running} className="min-h-11 gap-1.5 sm:min-h-9">
        {running ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> : <Sparkles aria-hidden="true" className="h-3 w-3" />}
        {running ? t("wands.working") : t(wand.labelKey)}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
