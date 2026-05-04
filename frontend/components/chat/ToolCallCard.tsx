// Renders the result of one AI-coach tool call inline in the chat stream.
//
// Self-gating: the card decides on its own whether to show an Apply
// button, auto-apply, or render a read-only summary — based on the tool's
// `mutates` flag, the result's `mutation.status`, and the user's
// `aiAutoApplyChanges` preference. Consumers do NOT pass canApply / isPro
// / etc. — they just hand over the tool id and the run result.
//
// Multiple tool calls per assistant turn render as multiple cards stacked
// in the message bubble.

import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getTool, commitMutation } from "@/lib/tools/registry";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { useAIAutoApply } from "@/lib/hooks/use-ai-auto-apply";

interface ToolCallCardProps {
  toolId: string;
  /** The tool's run() result (may carry a pending mutation). */
  result: NormalizedToolRunResult;
  /** Called when the result mutates (e.g. after Apply succeeds), so the
   *  parent can update its message bubble state without re-running. */
  onResultChange?: (next: NormalizedToolRunResult) => void;
}

export function ToolCallCard({ toolId, result, onResultChange }: ToolCallCardProps) {
  const tool = getTool(toolId);
  const queryClient = useQueryClient();
  const autoApply = useAIAutoApply();
  const [current, setCurrent] = useState(result);
  const [committing, setCommitting] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  // Auto-apply on mount if (a) this is a pending mutation, (b) the user
  // opted in, and (c) the user hasn't already discarded this card.
  useEffect(() => {
    if (
      autoApply &&
      tool?.mutates &&
      current.mutation?.status === "pending" &&
      !discarded &&
      !committing
    ) {
      void runApply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, current.mutation?.status]);

  if (!tool) {
    // Unknown tool id (e.g. registry was edited and a stale session is
    // replaying old turns). Silent fallback rather than crashing the chat.
    return null;
  }

  const Icon = tool.icon ?? Sparkles;

  async function runApply() {
    if (!current.mutation || current.mutation.status !== "pending") return;
    setCommitting(true);
    try {
      const next = await commitMutation(current, queryClient);
      setCurrent(next);
      onResultChange?.(next);
    } finally {
      setCommitting(false);
    }
  }

  function discard() {
    setDiscarded(true);
    const next: NormalizedToolRunResult = {
      ...current,
      mutation: current.mutation ? { ...current.mutation, status: "failed" } : undefined,
      summary: "Edit discarded.",
    };
    setCurrent(next);
    onResultChange?.(next);
  }

  const isMutation = !!tool.mutates && !!current.mutation;
  const status = current.mutation?.status;

  return (
    <div className="rounded-md border bg-background/60 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-6 w-6 rounded flex items-center justify-center",
            tool.accentClassName ?? "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="font-medium">{tool.label}</div>
        {isMutation && status === "applied" && (
          <Badge variant="default" className="ml-auto gap-1">
            <Check className="h-3 w-3" /> Applied
          </Badge>
        )}
        {isMutation && status === "failed" && (
          <Badge variant="secondary" className="ml-auto gap-1">
            <AlertCircle className="h-3 w-3" /> {discarded ? "Discarded" : "Failed"}
          </Badge>
        )}
      </div>

      {current.summary && (
        <p className="text-muted-foreground">{current.summary}</p>
      )}

      {current.previewText && (
        <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-2 max-h-48 overflow-y-auto">
          {current.previewText}
        </pre>
      )}

      {/* Score-style results from read-only tools */}
      {typeof current.overallScore === "number" && (
        <div className="text-xs">
          <span className="font-semibold">{current.overallScore}/100</span>
          {current.grade && <span className="text-muted-foreground"> · {current.grade}</span>}
        </div>
      )}
      {Array.isArray(current.recommendations) && current.recommendations.length > 0 && (
        <ul className="text-xs list-disc ml-4 space-y-0.5">
          {current.recommendations.slice(0, 3).map((r, i) => (
            <li key={i}>
              <span className="font-medium">{r.title}</span>
              {r.description && <span className="text-muted-foreground"> — {r.description}</span>}
            </li>
          ))}
        </ul>
      )}

      {isMutation && status === "pending" && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={runApply} disabled={committing}>
            {committing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
            {autoApply ? "Applying…" : "Apply"}
          </Button>
          <Button size="sm" variant="ghost" onClick={discard} disabled={committing}>
            <X className="h-3 w-3 mr-1" />
            Discard
          </Button>
          {autoApply && (
            <span className="text-xs text-muted-foreground ml-auto">Auto-apply on</span>
          )}
        </div>
      )}
    </div>
  );
}
