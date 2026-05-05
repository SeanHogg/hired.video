import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { ConsolidateHighlightsResponseSchema } from "@shared/tool-schemas";

/** Optional context the wand sends to the LLM so the rewrite is grounded
 *  in the parent entry (e.g. "Director of IT @ Acme"). When the parent
 *  doesn't pass any context the wand still works — the LLM just gets the
 *  bullets alone. When `aiContext` is omitted entirely the wand button
 *  doesn't render at all. */
export interface HighlightsAIContext {
  role?: string;
  organization?: string;
  summary?: string;
}

interface HighlightsEditorProps {
  highlights: string[] | null | undefined;
  onChange: (next: string[]) => void;
  label: string;
  addButtonText: string;
  placeholder: string;
  /** When provided, an AI wand button appears next to the add button.
   *  Pass undefined (the default) to render the editor without AI. */
  aiContext?: HighlightsAIContext;
}

export default function HighlightsEditor({
  highlights,
  onChange,
  label,
  addButtonText,
  placeholder,
  aiContext,
}: HighlightsEditorProps) {
  const list = highlights ?? [];

  const add = () => onChange([...list, ""]);
  const update = (i: number, value: string) => {
    const next = [...list];
    next[i] = value;
    onChange(next);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));

  const [consolidating, setConsolidating] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);

  const nonEmpty = list.filter((h) => h.trim().length > 0);
  const canConsolidate = aiContext !== undefined && nonEmpty.length >= 2;

  const runConsolidate = async () => {
    setConsolidating(true);
    try {
      const response = await apiClient.post(
        "/api/resumeoptimizer/consolidate-highlights",
        { highlights: nonEmpty, context: aiContext },
        ConsolidateHighlightsResponseSchema,
      );
      if (response.data.highlights.length === 0) {
        toast.error("AI couldn't consolidate these — try again in a moment.");
        return;
      }
      setPreview(response.data.highlights);
    } catch (err) {
      console.error("[HighlightsEditor] consolidate failed:", err);
      toast.error("AI consolidation failed. Please try again.");
    } finally {
      setConsolidating(false);
    }
  };

  const acceptPreview = () => {
    if (!preview) return;
    onChange(preview);
    setPreview(null);
    toast.success("Bullets consolidated.");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          {aiContext !== undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={runConsolidate}
              disabled={!canConsolidate || consolidating}
              title={
                canConsolidate
                  ? "Consolidate & rewrite with AI"
                  : "Add at least 2 bullets to consolidate"
              }
              aria-label="Consolidate bullets with AI"
            >
              {consolidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={add}>
            {addButtonText}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {list.map((highlight, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={highlight}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Review consolidated bullets
            </DialogTitle>
            <DialogDescription>
              The AI tightened {nonEmpty.length} bullets into {preview?.length ?? 0}.
              Review and accept to replace your current list, or cancel to keep what you have.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Current ({nonEmpty.length})
              </div>
              <ul className="space-y-1 text-sm">
                {nonEmpty.map((h, i) => (
                  <li key={i} className="rounded border bg-muted/30 px-3 py-2">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-primary">
                Suggested ({preview?.length ?? 0})
              </div>
              <ul className="space-y-1 text-sm">
                {(preview ?? []).map((h, i) => (
                  <li key={i} className="rounded border border-primary/30 bg-primary/5 px-3 py-2">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={acceptPreview}>
              Accept &amp; replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
