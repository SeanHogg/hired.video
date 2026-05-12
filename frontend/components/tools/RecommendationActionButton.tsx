// "Take action" button rendered next to each recommendation on the
// Resume Analysis page (Optimizer + Scorer). Self-gating: when no
// registered wand maps to this recommendation, or no resume is bound,
// the component returns null — the parent doesn't pass a `canApply`
// boolean and doesn't need to know which recommendations are
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
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import { findWandForRecommendation } from "@/lib/tools/find-wand-for-recommendation";
import { getTool } from "@/lib/tools/registry";
import type { NormalizedToolRunResult } from "@/lib/tools/types";

interface Props {
  recommendation: {
    category?: string;
    title: string;
    description?: string;
  };
  /** Active resume id. Required for any mutation tool — when undefined
   *  this component returns null (no apply target). */
  resumeId: string | undefined;
  /** Optional sample bullet text the optimizer's LLM quoted in the
   *  recommendation. Lets `consolidate_section_highlights` locate the
   *  right section by content. When absent, button still resolves but
   *  some categories may be hidden (e.g. consolidate needs an anchor). */
  matchHighlight?: string;
}

export function RecommendationActionButton({ recommendation, resumeId, matchHighlight }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<NormalizedToolRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Self-gate: no resume bound → nothing to mutate.
  if (!resumeId) return null;

  const wand = findWandForRecommendation(recommendation, { matchHighlight });
  if (!wand) return null;

  const tool = getTool(wand.toolId);
  if (!tool) return null;

  async function handleClick() {
    if (!wand) return;
    setRunning(true);
    setError(null);
    try {
      const tool = getTool(wand.toolId);
      if (!tool) throw new Error(`Unknown tool: ${wand.toolId}`);
      const out = await tool.run({ bound: { resumeId }, args: wand.args });
      setResult(out);
    } catch (err: any) {
      setError(err?.message ?? "Action failed.");
    } finally {
      setRunning(false);
    }
  }

  if (result) {
    return (
      <div className="mt-3">
        <ToolCallCard
          toolId={wand.toolId}
          result={result}
          onResultChange={(next) => setResult(next)}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <Button size="sm" onClick={handleClick} disabled={running} className="gap-1.5">
        {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {running ? "Working…" : wand.label}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
