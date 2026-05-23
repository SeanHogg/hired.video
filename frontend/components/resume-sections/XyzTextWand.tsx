// Compact wand button that rewrites a single text field (work / volunteer /
// project summary, or a position title) using the XYZ-format editorial
// lens, then shows a side-by-side review modal where the user can edit the
// proposed text before replacing the saved value.
//
// Self-gates on the input being non-empty so the parent doesn't have to
// pass a `canRun` boolean — pass the value + onChange + kind, and the
// wand decides its own visibility. Used inline next to position / summary
// inputs across WorkExperienceSection, VolunteerSection, ProjectsSection,
// and the basics summary on the resume editor.

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import {
  RewriteXyzTextResponseSchema,
  type RewriteXyzKind,
} from "@shared/tool-schemas";

export interface XyzTextWandContext {
  role?: string;
  organization?: string;
  /** Bullets sitting under this field — gives the model grounding for what
   *  the summary should foreshadow. Ignored for `kind: "position"`. */
  highlights?: string[];
}

interface XyzTextWandProps {
  kind: RewriteXyzKind;
  value: string;
  onChange: (next: string) => void;
  context?: XyzTextWandContext;
  /** Override the tooltip + dialog copy. Defaults derive from `kind`. */
  fieldLabel?: string;
}

const DEFAULT_FIELD_LABEL: Record<RewriteXyzKind, string> = {
  summary: "summary",
  position: "title",
};

const DIALOG_TITLE: Record<RewriteXyzKind, string> = {
  summary: "Review XYZ-format summary",
  position: "Review polished title",
};

const DIALOG_DESCRIPTION: Record<RewriteXyzKind, string> = {
  summary:
    "The AI reframed this summary to foreshadow XYZ-format accomplishments. Edit before accepting.",
  position:
    "The AI polished the title — expanded abbreviations and normalised capitalisation without changing seniority. Edit before accepting.",
};

export default function XyzTextWand({
  kind,
  value,
  onChange,
  context,
  fieldLabel,
}: XyzTextWandProps) {
  const [running, setRunning] = useState(false);
  const [previewOriginal, setPreviewOriginal] = useState<string | null>(null);
  const [previewImproved, setPreviewImproved] = useState<string>("");
  const dialogOpen = previewOriginal !== null;

  const trimmed = value?.trim() ?? "";
  const canRun = trimmed.length > 0;
  const tooltipLabel = fieldLabel ?? DEFAULT_FIELD_LABEL[kind];

  const runWand = async () => {
    setRunning(true);
    try {
      const response = await apiClient.post(
        "/api/resumeoptimizer/rewrite-xyz-text",
        { kind, original: trimmed, context },
        RewriteXyzTextResponseSchema,
      );
      const improved = response.data.improved?.trim() ?? "";
      if (!improved) {
        toast.error("AI couldn't rewrite this — try again in a moment.");
        return;
      }
      if (improved === trimmed) {
        toast.info("AI returned the original — already looks tight.");
        return;
      }
      setPreviewOriginal(trimmed);
      setPreviewImproved(improved);
    } catch (err) {
      console.error(`[XyzTextWand:${kind}] failed:`, err);
      toast.error("AI rewrite failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const closePreview = () => {
    setPreviewOriginal(null);
    setPreviewImproved("");
  };

  const acceptPreview = () => {
    const next = previewImproved.trim();
    if (!next) {
      toast.error("Nothing to accept — the suggested text is empty.");
      return;
    }
    onChange(next);
    toast.success(
      kind === "position" ? "Title updated." : "Summary rewritten in XYZ format.",
    );
    closePreview();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={runWand}
        disabled={!canRun || running}
        title={
          canRun
            ? `Rewrite this ${tooltipLabel} with AI`
            : `Enter a ${tooltipLabel} first`
        }
        aria-label={`Rewrite ${tooltipLabel} with AI`}
        className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
      </Button>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              {DIALOG_TITLE[kind]}
            </DialogTitle>
            <DialogDescription>{DIALOG_DESCRIPTION[kind]}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Current
              </div>
              <div className="rounded border border-transparent bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {previewOriginal}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-primary">
                Suggested
              </div>
              <Textarea
                value={previewImproved}
                onChange={(e) => setPreviewImproved(e.target.value)}
                rows={kind === "position" ? 2 : 5}
                className="resize-y bg-background text-sm"
                aria-label="Suggested rewrite"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePreview}>
              Cancel
            </Button>
            <Button type="button" onClick={acceptPreview}>
              Accept &amp; replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
