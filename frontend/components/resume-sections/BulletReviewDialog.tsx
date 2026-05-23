// Shared review-dialog primitive for AI bullet-rewrite flows. Renders
// the side-by-side "current → suggested" comparison with editable
// suggestion textareas and per-row "merged from #N, #M" provenance.
//
// Two wands live on top of this: the existing Consolidate flow on
// HighlightsEditor and the new XYZ-format rewrite. Both produce the
// same `{ text, sources }[]` shape, so they share one review surface
// — different system prompts, identical preview UX.
//
// Self-contained: the dialog owns the editable-text state and the
// hovered-suggestion state. Parent passes the immutable input + items
// and gets back the user-edited array on accept.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ConsolidateHighlightsItem } from "@shared/tool-schemas";

interface BulletReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown in the dialog header, e.g. "Review consolidated bullets". */
  title: string;
  /** Icon shown next to the title (Sparkles, Wand2, etc.). */
  icon: React.ReactNode;
  /** One-line description; called with (sourceCount, suggestedCount) so the
   *  caller can write "tightened N into M" copy. */
  description: (sourceCount: number, suggestedCount: number) => React.ReactNode;
  /** The exact bullet snapshot the model saw — used as the "current" column
   *  so the preview can't drift if the editor mutated state mid-request. */
  sources: string[];
  /** Model-returned suggestions with provenance. */
  items: ConsolidateHighlightsItem[];
  /** Called with the user-edited (and possibly trimmed/filtered) text list. */
  onAccept: (texts: string[]) => void;
  /** Override for the "Accept &amp; replace" button label. */
  acceptLabel?: string;
}

export default function BulletReviewDialog({
  open,
  onOpenChange,
  title,
  icon,
  description,
  sources,
  items,
  onAccept,
  acceptLabel = "Accept & replace",
}: BulletReviewDialogProps) {
  // Editable copy of suggested-bullet text. Decoupled from the immutable
  // `items` prop so users can tweak each bullet inline without losing the
  // "from N, M" provenance the model returned. Re-seeded whenever `items`
  // changes (i.e. the wand fired again) so re-opening with a new batch
  // shows the new text instead of the stale buffer from the last run.
  const [editedTexts, setEditedTexts] = useState<string[]>(() => items.map((i) => i.text));
  useEffect(() => {
    setEditedTexts(items.map((i) => i.text));
  }, [items]);

  const [hoveredSuggestion, setHoveredSuggestion] = useState<number | null>(null);

  // Set of source-bullet indices (0-based) the currently-hovered suggestion
  // came from, used to highlight the matching items on the left.
  const highlightedSourceIdx =
    hoveredSuggestion !== null && items[hoveredSuggestion]
      ? new Set(items[hoveredSuggestion].sources.map((s) => s - 1))
      : new Set<number>();

  const handleAccept = () => {
    const next = editedTexts.map((t) => t.trim()).filter((t) => t.length > 0);
    onAccept(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>{description(sources.length, items.length)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Current ({sources.length})
            </div>
            <ol className="space-y-1 text-sm list-none">
              {sources.map((h, i) => {
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
              Suggested ({items.length})
            </div>
            <ul className="space-y-2 text-sm list-none">
              {items.map((item, i) => {
                const validSources = item.sources.filter(
                  (s) => s >= 1 && s <= sources.length,
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAccept}>
            {acceptLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
