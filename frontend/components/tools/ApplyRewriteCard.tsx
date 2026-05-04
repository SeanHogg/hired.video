// Renders a single "original → improved" rewrite suggestion with an
// Apply / Reject control. Self-gates on whether a saved resume is bound
// (via `useApplyToResume`); the parent doesn't pass a canX boolean and
// doesn't need to know whether the apply is possible.

import { useState } from "react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApplyToResume } from "@/lib/tools/use-apply-to-resume";
import { useToast } from "@/hooks/use-toast";

interface Props {
  original: string;
  improved: string;
  resumeId: string | undefined;
}

type RowState =
  | { kind: "idle" }
  | { kind: "applying" }
  | { kind: "applied"; location: string }
  | { kind: "rejected" }
  | { kind: "no_match" }
  | { kind: "error"; message: string };

export default function ApplyRewriteCard({ original, improved, resumeId }: Props) {
  const { applyRewrite, canApply } = useApplyToResume(resumeId);
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const { toast } = useToast();

  const handleApply = async () => {
    setState({ kind: "applying" });
    const res = await applyRewrite({ original, improved });
    if (res.ok === true) {
      setState({ kind: "applied", location: res.location });
      toast({
        title: "Applied to resume",
        description: "Your resume has been updated.",
      });
      return;
    }
    if (res.reason === "no_match") {
      setState({ kind: "no_match" });
      return;
    }
    const message = res.message ?? "Save failed";
    setState({ kind: "error", message });
    toast({
      title: "Couldn't apply rewrite",
      description: message,
      variant: "destructive",
    });
  };

  const isDone = state.kind === "applied" || state.kind === "rejected";
  const showRejectedNote = state.kind === "rejected";
  const showNoMatch = state.kind === "no_match";
  const showAppliedNote = state.kind === "applied";

  return (
    <div className="space-y-2">
      <div
        className={`rounded-md border p-3 text-sm ${
          isDone
            ? "bg-muted/40 border-border text-muted-foreground line-through"
            : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 line-through opacity-75"
        }`}
      >
        {original}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground text-xs px-1">
        <ChevronRight className="w-3 h-3" /> becomes
      </div>
      <div
        className={`rounded-md border p-3 text-sm font-medium ${
          state.kind === "rejected"
            ? "bg-muted/40 border-border text-muted-foreground"
            : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400"
        }`}
      >
        {improved}
      </div>

      {canApply && state.kind !== "applied" && state.kind !== "rejected" && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleApply}
            disabled={state.kind === "applying"}
            className="gap-1.5"
          >
            {state.kind === "applying" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Apply to resume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState({ kind: "rejected" })}
            disabled={state.kind === "applying"}
            className="gap-1.5"
          >
            <X className="w-3 h-3" />
            Reject
          </Button>
          {showNoMatch && (
            <span className="text-xs text-orange-600 dark:text-orange-400">
              Couldn't locate this bullet in the resume — edit manually.
            </span>
          )}
        </div>
      )}

      {showAppliedNote && (
        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
          <Check className="w-3 h-3" /> Applied to {state.location}
        </p>
      )}
      {showRejectedNote && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <X className="w-3 h-3" /> Rejected
        </p>
      )}
    </div>
  );
}
