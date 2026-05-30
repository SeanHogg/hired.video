/**
 * #989 — Skills "magic wand" for ATS clarity. Calls
 * `/api/resumeoptimizer/rewrite-skills`, which normalises casing,
 * expands ambiguous abbreviations, and dedupes near-synonyms across
 * the supplied skill list. The dialog shows a side-by-side review
 * (current ↔ normalised) — same shape as the bullet review dialog,
 * so the user can read a merge note like "merged 'aws' + 'AWS' → AWS".
 *
 * Self-gates on `skills.length > 0` so callers don't have to wire a
 * canRun boolean. Pass an `onApply(canonical)` callback that decides
 * how the parent integrates the canonical list (replace the whole
 * section, replace only deduped pairs, etc.).
 */

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
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

interface SkillsResponseItem {
  text: string;
  sources: number[];
  note?: string;
}

interface XyzSkillsWandProps {
  skills: string[];
  onApply: (canonical: string[]) => void;
}

export default function XyzSkillsWand({ skills, onApply }: XyzSkillsWandProps) {
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<SkillsResponseItem[] | null>(null);

  const trimmed = (skills ?? []).map((s) => (s ?? "").trim()).filter((s) => s.length > 0);
  const canRun = trimmed.length > 0;

  const runWand = async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      const response = await apiClient.post(
        "/api/resumeoptimizer/rewrite-skills",
        { skills: trimmed },
      );
      const items = (response.data?.items ?? []) as SkillsResponseItem[];
      if (!items.length) {
        toast.error("AI couldn't normalise these — try again in a moment.");
        return;
      }
      const noChange = items.every(
        (item, i) => item.text === trimmed[i] && (item.sources?.length ?? 0) <= 1,
      );
      if (noChange) {
        toast.info("AI returned the original list — already tight.");
        return;
      }
      setPreview(items);
    } catch (err) {
      console.error("[XyzSkillsWand] failed:", err);
      toast.error("AI rewrite failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const closePreview = () => setPreview(null);

  const acceptPreview = () => {
    if (!preview) return;
    onApply(preview.map((item) => item.text));
    toast.success(`Skills normalised (${preview.length} canonical entries).`);
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
        title={canRun ? "Normalise + dedupe with AI" : "Add at least one skill first"}
        aria-label="Normalise skills with AI"
        className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      </Button>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Review normalised skills
            </DialogTitle>
            <DialogDescription>
              AI normalised casing, expanded abbreviations, and merged near-synonyms. Review the
              canonical list below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {(preview ?? []).map((item, idx) => {
              const merged = (item.sources?.length ?? 0) > 1;
              const sourceLabels = (item.sources ?? [])
                .map((srcIdx) => trimmed[srcIdx - 1])
                .filter((s) => s);
              return (
                <div
                  key={`${item.text}-${idx}`}
                  className="rounded border bg-muted/20 p-3 text-sm flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="font-medium">{item.text}</div>
                    {merged && (
                      <div className="text-xs text-muted-foreground mt-1">
                        merged: {sourceLabels.join(" + ")}
                      </div>
                    )}
                    {item.note && (
                      <div className="text-xs text-muted-foreground mt-1">{item.note}</div>
                    )}
                  </div>
                </div>
              );
            })}
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
