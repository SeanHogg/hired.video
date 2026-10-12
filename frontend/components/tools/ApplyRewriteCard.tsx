// Renders a single "original → improved" rewrite suggestion with an
// Apply / Reject control. Self-gates on whether a saved resume is bound
// (via `useApplyToResume`); the parent doesn't pass a canX boolean and
// doesn't need to know whether the apply is possible.

import { useState } from "react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const handleApply = async () => {
    setState({ kind: "applying" });
    const res = await applyRewrite({ original, improved });
    if (res.ok === true) {
      setState({ kind: "applied", location: res.location });
      toast({
        title: t("toolSteps.rewrite.appliedTitle"),
        description: t("toolSteps.rewrite.appliedDescription"),
      });
      return;
    }
    if (res.reason === "no_match") {
      setState({ kind: "no_match" });
      return;
    }
    const message = res.message ?? t("errors.saveFailed");
    setState({ kind: "error", message });
    toast({
      title: t("toolSteps.rewrite.applyFailed"),
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
        className={`rounded-xl border p-3 text-sm ${
          isDone
            ? "bg-muted border-border text-muted-foreground line-through"
            : "bg-destructive/10 border-destructive/30 text-destructive line-through opacity-75"
        }`}
      >
        {original}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground text-xs px-1">
        <ChevronRight className="w-3 h-3" aria-hidden="true" /> {t("toolSteps.rewrite.becomes")}
      </div>
      <div
        className={`rounded-xl border p-3 text-sm font-medium ${
          state.kind === "rejected"
            ? "bg-muted border-border text-muted-foreground"
            : "bg-brand-green/10 dark:bg-brand-green/20 border-brand-green/30 text-brand-green-text"
        }`}
      >
        {improved}
      </div>

      {canApply && state.kind !== "applied" && state.kind !== "rejected" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleApply}
            disabled={state.kind === "applying"}
            className="min-h-11 gap-1.5"
          >
            {state.kind === "applying" ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="w-3 h-3" aria-hidden="true" />
            )}
            {t("toolSteps.rewrite.apply")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState({ kind: "rejected" })}
            disabled={state.kind === "applying"}
            className="min-h-11 gap-1.5"
          >
            <X className="w-3 h-3" aria-hidden="true" />
            {t("actions.reject")}
          </Button>
          {showNoMatch && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("toolSteps.rewrite.noMatch")}
            </span>
          )}
        </div>
      )}

      {showAppliedNote && (
        <p className="text-xs text-brand-green-text flex items-center gap-1.5">
          <Check className="w-3 h-3" aria-hidden="true" />{" "}
          {t("toolSteps.rewrite.appliedTo", { location: state.location })}
        </p>
      )}
      {showRejectedNote && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <X className="w-3 h-3" aria-hidden="true" /> {t("labels.rejected")}
        </p>
      )}
    </div>
  );
}
