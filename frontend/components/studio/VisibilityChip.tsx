/**
 * VisibilityChip — at-a-glance Public / Private indicator for a studio
 * project, with a one-click toggle.
 *
 * Self-contained: owns its own pending state and the "render-then-
 * publish" branching. Callers pass primitive flags only (`isPublic`,
 * `busy`, `hasVideo`) — never the v1 `StudioProjectState` envelope —
 * so the chip drops into any editor surface (v1, v2, future host).
 *
 * Behaviour:
 *   • Already public  → click flips back to private (calls onMakePublic(false)).
 *   • Private + hasVideo → click publishes (onMakePublic(true)).
 *   • Private + no video → click kicks off `onRenderAndPublish` if
 *     provided, otherwise falls back to a plain `onMakePublic(true)`.
 */

import { useState } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface VisibilityChipProps {
  isPublic: boolean;
  /** Caller-supplied busy gate (host knows about saves / renders /
   *  uploads in flight; chip just defers). Combined with the chip's own
   *  pending state during the toggle. */
  busy?: boolean;
  /** True when the project already has a rendered video. False routes
   *  publish through `onRenderAndPublish` (when supplied). */
  hasVideo?: boolean;
  onMakePublic: (next: boolean) => void | Promise<void>;
  /** Optional render-then-publish chain. When `hasVideo` is false and
   *  this is supplied, the chip calls it instead of `onMakePublic(true)`.
   *  Hosts that don't have a render pipeline omit it. */
  onRenderAndPublish?: () => void | Promise<void>;
  className?: string;
}

export default function VisibilityChip({
  isPublic,
  busy: externalBusy = false,
  hasVideo = true,
  onMakePublic,
  onRenderAndPublish,
  className,
}: VisibilityChipProps) {
  const [pending, setPending] = useState(false);
  const busy = externalBusy || pending;

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
