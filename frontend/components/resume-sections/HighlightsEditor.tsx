import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
  ConsolidateHighlightsResponseSchema,
  type ConsolidateHighlightsItem,
} from "@shared/tool-schemas";

/** Optional context the wand sends to the LLM so the rewrite is grounded
 *  in the parent entry (e.g. "Director of IT @ Acme"). When `aiContext`
 *  is omitted the wand button doesn't render at all — shared component
 *  decides its own visibility. */
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
  // The non-empty subset we actually sent to the LLM. We keep it in state
  // so the preview dialog renders against the same snapshot the model
  // saw — picking it back out of `list` would re-include any new empty
  // bullet the user added while the request was in flight.
  const [previewSources, setPreviewSources] = useState<string[] | null>(null);
  const [previewItems, setPreviewItems] = useState<ConsolidateHighlightsItem[] | null>(null);
  // Editable copy of suggested-bullet text. Decoupled from the immutable
  // `previewItems` so users can tweak each bullet inline before accepting
  // without losing the "from N, M" provenance the model returned.
  const [editedTexts, setEditedTexts] = useState<string[]>([]);
  const [hoveredSuggestion, setHoveredSuggestion] = useState<number | null>(null);

  const nonEmpty = list.filter((h) => h.trim().length > 0);
  const canConsolidate = aiContext !== undefined && nonEmpty.length >= 2;

  const closePreview = () => {
    setPreviewItems(null);
    setPreviewSources(null);
    setEditedTexts([]);
    setHoveredSuggestion(null);
  };

  const runConsolidate = async () => {
    setConsolidating(true);
    try {
      const sent = nonEmpty;
      const response = await apiClient.post(
        "/api/resumeoptimizer/consolidate-highlights",
        { highlights: sent, context: aiContext },
        ConsolidateHighlightsResponseSchema,
      );
      const items = response.data.items;
      if (items.length === 0) {
        toast.error("AI couldn't consolidate these — try again in a moment.");
        return;
      }
      setPreviewSources(sent);
      setPreviewItems(items);
      setEditedTexts(items.map((i) => i.text));
    } catch (err) {
      console.error("[HighlightsEditor] consolidate failed:", err);
      toast.error("AI consolidation failed. Please try again.");
    } finally {
      setConsolidating(false);
    }
  };

  const acceptPreview = () => {
    const next = editedTexts.map((t) => t.trim()).filter((t) => t.length > 0);
    if (next.length === 0) {
      toast.error("Nothing to accept — every suggested bullet is empty.");
      return;
    }
    onChange(next);
    toast.success("Bullets consolidated.");
    closePreview();
  };

  // Set of source-bullet indices (0-based) the currently-hovered suggestion
  // came from, used to highlight the matching items on the left.
  const highlightedSourceIdx =
    hoveredSuggestion !== null && previewItems
      ? new Set(previewItems[hoveredSuggestion]?.sources.map((s) => s - 1) ?? [])
      : new Set<number>();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          {aiContext !== undefined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runConsolidate}
              disabled={!canConsolidate || consolidating}
              title={
                canConsolidate
                  ? "Consolidate & rewrite with AI"
                  : "Add at least 2 bullets to consolidate"
              }
              aria-label="Consolidate bullets with AI"
              className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
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

      <Dialog
        open={previewItems !== null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Review consolidated bullets
            </DialogTitle>
            <DialogDescription>
              The AI tightened {previewSources?.length ?? 0} bullets into{" "}
              {previewItems?.length ?? 0}. Hover a suggestion to see which originals fed it.
              Edit any suggestion inline before accepting.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Current ({previewSources?.length ?? 0})
              </div>
              <ol className="space-y-1 text-sm list-none">
                {(previewSources ?? []).map((h, i) => {
                  const isHighlighted = highlightedSourceIdx.has(i);
                  return (
                    <li
                      key={i}
                      className={cn(
                        "rounded border px-3 py-2 transition-colors",
                        isHighlighted
                          ? "border-primary bg-primary/10"
                          : "border-transparent bg-muted/30",
                      )}
                    >
                      <span className="mr-2 inline-block w-5 text-right text-xs font-mono text-muted-foreground">
                        {i + 1}.
                      </span>
                      {h}
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-primary">
                Suggested ({previewItems?.length ?? 0})
              </div>
              <ul className="space-y-2 text-sm list-none">
                {(previewItems ?? []).map((item, i) => {
                  const validSources = item.sources.filter(
                    (s) => s >= 1 && s <= (previewSources?.length ?? 0),
                  );
                  return (
                    <li
                      key={i}
                      className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1"
                      onMouseEnter={() => setHoveredSuggestion(i)}
                      onMouseLeave={() => setHoveredSuggestion(null)}
                      onFocus={() => setHoveredSuggestion(i)}
                      onBlur={() => setHoveredSuggestion(null)}
                    >
                      <Textarea
                        value={editedTexts[i] ?? ""}
                        onChange={(e) => {
                          const next = [...editedTexts];
                          next[i] = e.target.value;
                          setEditedTexts(next);
                        }}
                        rows={2}
                        className="min-h-[2.5rem] resize-y bg-background text-sm"
                        aria-label={`Suggested bullet ${i + 1}`}
                      />
                      {validSources.length > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          merged from{" "}
                          {validSources.map((s, idx) => (
                            <span key={s}>
                              <span className="font-mono font-medium text-primary">#{s}</span>
                              {idx < validSources.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
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
    </div>
  );
}
