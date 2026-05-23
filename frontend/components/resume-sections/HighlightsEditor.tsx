import { useState } from "react";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import {
  ConsolidateHighlightsResponseSchema,
  RewriteXyzHighlightsResponseSchema,
  type ConsolidateHighlightsItem,
} from "@shared/tool-schemas";
import BulletReviewDialog from "./BulletReviewDialog";

/** Optional context the wand sends to the LLM so the rewrite is grounded
 *  in the parent entry (e.g. "Director of IT @ Acme"). When `aiContext`
 *  is omitted the wand buttons don't render at all — shared component
 *  decides its own visibility. */
export interface HighlightsAIContext {
  role?: string;
  organization?: string;
  summary?: string;
}

type WandMode = "consolidate" | "xyz";

interface HighlightsEditorProps {
  highlights: string[] | null | undefined;
  onChange: (next: string[]) => void;
  label: string;
  addButtonText: string;
  placeholder: string;
  /** When provided, AI wand buttons appear next to the add button. Pass
   *  undefined (the default) to render the editor without AI. */
  aiContext?: HighlightsAIContext;
}

const MODE_ENDPOINTS: Record<WandMode, string> = {
  consolidate: "/api/resumeoptimizer/consolidate-highlights",
  xyz: "/api/resumeoptimizer/rewrite-xyz-highlights",
};

const MODE_RESPONSE_SCHEMA = {
  consolidate: ConsolidateHighlightsResponseSchema,
  xyz: RewriteXyzHighlightsResponseSchema,
} as const;

const MODE_FAIL_TOAST: Record<WandMode, string> = {
  consolidate: "AI consolidation failed. Please try again.",
  xyz: "AI rewrite failed. Please try again.",
};

const MODE_EMPTY_TOAST: Record<WandMode, string> = {
  consolidate: "AI couldn't consolidate these — try again in a moment.",
  xyz: "AI couldn't rewrite these — try again in a moment.",
};

const MODE_DIALOG_TITLE: Record<WandMode, string> = {
  consolidate: "Review consolidated bullets",
  xyz: "Review XYZ-format bullets",
};

const MODE_SUCCESS_TOAST: Record<WandMode, string> = {
  consolidate: "Bullets consolidated.",
  xyz: "Bullets rewritten in XYZ format.",
};

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

  const [activeMode, setActiveMode] = useState<WandMode | null>(null);
  // The non-empty subset we actually sent to the LLM. We keep it in state
  // so the preview dialog renders against the same snapshot the model
  // saw — picking it back out of `list` would re-include any new empty
  // bullet the user added while the request was in flight.
  const [previewMode, setPreviewMode] = useState<WandMode | null>(null);
  const [previewSources, setPreviewSources] = useState<string[]>([]);
  const [previewItems, setPreviewItems] = useState<ConsolidateHighlightsItem[]>([]);

  const nonEmpty = list.filter((h) => h.trim().length > 0);
  const canRun = aiContext !== undefined && nonEmpty.length >= 2;
  const dialogOpen = previewMode !== null;

  const closePreview = () => {
    setPreviewMode(null);
    setPreviewSources([]);
    setPreviewItems([]);
  };

  const runWand = async (mode: WandMode) => {
    setActiveMode(mode);
    try {
      const sent = nonEmpty;
      const response = await apiClient.post(
        MODE_ENDPOINTS[mode],
        { highlights: sent, context: aiContext },
        MODE_RESPONSE_SCHEMA[mode],
      );
      const items = response.data.items;
      if (items.length === 0) {
        toast.error(MODE_EMPTY_TOAST[mode]);
        return;
      }
      setPreviewMode(mode);
      setPreviewSources(sent);
      setPreviewItems(items);
    } catch (err) {
      console.error(`[HighlightsEditor] ${mode} failed:`, err);
      toast.error(MODE_FAIL_TOAST[mode]);
    } finally {
      setActiveMode(null);
    }
  };

  const acceptPreview = (texts: string[]) => {
    if (texts.length === 0) {
      toast.error("Nothing to accept — every suggested bullet is empty.");
      return;
    }
    onChange(texts);
    toast.success(previewMode ? MODE_SUCCESS_TOAST[previewMode] : "Applied.");
    closePreview();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          {aiContext !== undefined ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runWand("consolidate")}
                disabled={!canRun || activeMode !== null}
                title={
                  canRun
                    ? "Consolidate & tighten with AI"
                    : "Add at least 2 bullets to consolidate"
                }
                aria-label="Consolidate bullets with AI"
                className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              >
                {activeMode === "consolidate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runWand("xyz")}
                disabled={!canRun || activeMode !== null}
                title={
                  canRun
                    ? "Rewrite in XYZ accomplishment format"
                    : "Add at least 2 bullets to rewrite"
                }
                aria-label="Rewrite bullets in XYZ format with AI"
                className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              >
                {activeMode === "xyz" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
              </Button>
            </>
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

      <BulletReviewDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
        title={previewMode ? MODE_DIALOG_TITLE[previewMode] : ""}
        icon={
          previewMode === "xyz" ? (
            <Wand2 className="h-4 w-4 text-primary" />
          ) : (
            <Sparkles className="h-4 w-4 text-primary" />
          )
        }
        description={(sourcesLen, itemsLen) =>
          previewMode === "xyz"
            ? `The AI rewrote ${sourcesLen} bullets into ${itemsLen} XYZ-format bullets. Hover a suggestion to see which originals fed it. Edit any suggestion inline before accepting.`
            : `The AI tightened ${sourcesLen} bullets into ${itemsLen}. Hover a suggestion to see which originals fed it. Edit any suggestion inline before accepting.`
        }
        sources={previewSources}
        items={previewItems}
        onAccept={acceptPreview}
      />
    </div>
  );
}
