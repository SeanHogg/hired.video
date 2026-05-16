/**
 * VisibilityChip — at-a-glance Public / Private indicator for a studio
 * project, with a one-click toggle.
 *
 * Pure visibility toggle. After the Save/Publish split (#665) the
 * unified <StudioPlayer/> plays the saved script JSON live, so making
 * a project public no longer requires an MP4 — the project becomes
 * viewable in-platform the moment this flips true. The render-and-
 * publish-to-external chain (YouTube / LinkedIn) lives in the Publish
 * menu, not on this chip (#680).
 *
 * Self-contained: owns its own pending state. Callers pass primitive
 * flags only (`isPublic`, `busy`) — never the v1 `StudioProjectState`
 * envelope — so the chip drops into any editor surface.
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
  onMakePublic: (next: boolean) => void | Promise<void>;
  className?: string;
}

export default function VisibilityChip({
  isPublic,
  busy: externalBusy = false,
  onMakePublic,
  className,
}: VisibilityChipProps) {
  const [pending, setPending] = useState(false);
  const busy = externalBusy || pending;

  const Icon = busy ? Loader2 : isPublic ? Globe : Lock;
  const label = isPublic ? "Public" : "Private";
  const title = isPublic
    ? "Public — click to make private"
    : "Private — click to publish";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setPending(true);
    try {
      await onMakePublic(!isPublic);
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
