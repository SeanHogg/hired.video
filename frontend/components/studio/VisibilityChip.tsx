/**
 * VisibilityChip — at-a-glance Public / Private indicator for a studio
 * project, with a one-click toggle.
 *
 * Self-contained: the chip owns its hover state, the disabled-while-busy
 * gate, and the "if not rendered, render-then-publish" branching. Callers
 * pass raw state + handlers (`onMakePublic`, `onRenderAndPublish`),
 * never derived booleans.
 *
 * Behaviour:
 *   • Already public  → click flips back to private (calls onMakePublic(false)).
 *   • Public + unrendered (impossible today, but cheap to handle) → same.
 *   • Private + has video → click publishes (onMakePublic(true)).
 *   • Private + no video  → click kicks off the render pipeline AND queues
 *     the publish; the parent's `onRenderAndPublish` decides how to chain
 *     them. Until that resolves the chip shows a spinner.
 */

import { useState } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudioProjectState } from "@/types/studio";

interface VisibilityChipProps {
  state: StudioProjectState;
  isPublic: boolean;
  onMakePublic: (next: boolean) => void | Promise<void>;
  /** Called when the user wants to publish but the project hasn't been
   *  rendered yet. Implementations typically run the full save → generate
   *  → render → upload pipeline, then call onMakePublic(true) on success. */
  onRenderAndPublish?: () => void | Promise<void>;
  className?: string;
}

const BUSY_STATUSES: ReadonlySet<StudioProjectState["status"]> = new Set([
  "generating",
  "exporting",
  "uploading",
  "publishing",
]);

export default function VisibilityChip({
  state,
  isPublic,
  onMakePublic,
  onRenderAndPublish,
  className,
}: VisibilityChipProps) {
  const [pending, setPending] = useState(false);
  const busy = BUSY_STATUSES.has(state.status) || pending;
  const hasVideo = state.videoBlob != null || state.videoUrl != null;

  const Icon = busy ? Loader2 : isPublic ? Globe : Lock;
  const label = isPublic ? "Public" : "Private";
  const title = isPublic
    ? "Public — click to make private"
    : hasVideo
      ? "Private — click to publish"
      : "Private — click to render and publish";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setPending(true);
    try {
      if (isPublic) {
        await onMakePublic(false);
        return;
      }
      // Going public: if the video isn't rendered yet, defer to the
      // parent's render-and-publish chain. Falls back to a plain publish
      // attempt when no chain is provided so the chip still does
      // something useful in tests / minimal setups.
      if (!hasVideo && onRenderAndPublish) {
        await onRenderAndPublish();
        return;
      }
      await onMakePublic(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors",
        isPublic
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/25"
          : "bg-muted text-foreground hover:bg-muted/70",
        busy && "opacity-60 cursor-wait",
        className,
      )}
    >
      <Icon className={cn("w-3 h-3", busy && "animate-spin")} />
      {label}
    </button>
  );
}
