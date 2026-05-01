/**
 * DownloadButton — paid/creator/superadmin shortcut for downloading the
 * rendered video as a local file.
 *
 * Self-contained: the entitlement gate (Pro / video creator / superadmin)
 * lives entirely inside this component, fetched from `useAuth`,
 * `useSubscription`, and `creatorService.getMine()`. Callers don't need
 * to know who's allowed to download — they just drop `<DownloadButton ... />`
 * and trust it to render only when meaningful.
 *
 * The component returns null when:
 *   • the user isn't entitled (free + non-creator + non-superadmin)
 *   • or no rendered video is available yet
 *   • or no download handler was passed
 *
 * Two visual modes:
 *   • icon-only (default in narrow surfaces like the sidebar action cluster)
 *   • labelled (used in the player row where there's space for "Download")
 */

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { creatorService } from "@/lib/services/creator-service";
import type { StudioProjectState } from "@/types/studio";

interface DownloadButtonProps {
  state: StudioProjectState;
  /** When omitted, the button is hidden — same as not entitled. */
  onDownload?: () => void;
  /** Render as a square icon (sidebar) vs labelled button (player row). */
  iconOnly?: boolean;
  className?: string;
}

const BUSY_STATUSES: ReadonlySet<StudioProjectState["status"]> = new Set([
  "generating",
  "exporting",
  "uploading",
  "publishing",
]);

/** Lightweight one-shot fetch of the active user's video-creator status.
 *  Lives here instead of in a global hook because download-gating is the
 *  only consumer right now; if a second surface needs it we can promote
 *  to a shared hook. */
function useIsVideoCreator(): boolean {
  const { user } = useAuth();
  const [isVideoCreator, setIsVideoCreator] = useState(false);
  useEffect(() => {
    if (!user) {
      setIsVideoCreator(false);
      return;
    }
    let cancelled = false;
    void creatorService
      .getMine()
      .then((profile) => {
        if (!cancelled) setIsVideoCreator(profile?.videoActive === true);
      })
      .catch(() => {
        if (!cancelled) setIsVideoCreator(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return isVideoCreator;
}

export default function DownloadButton({
  state,
  onDownload,
  iconOnly = false,
  className,
}: DownloadButtonProps) {
  const { isSuperAdmin } = useAuth();
  const { isPro } = useSubscription();
  const isVideoCreator = useIsVideoCreator();

  // Gate: Pro / creator / superadmin AND there's something to download.
  const canDownload = isPro || isVideoCreator || isSuperAdmin;
  if (!canDownload || !onDownload) return null;
  const hasVideo = state.videoBlob != null || state.videoUrl != null;
  if (!hasVideo) return null;

  const busy = BUSY_STATUSES.has(state.status);

  // Stop event propagation so embedding inside a clickable parent (e.g. the
  // active row in Recent) doesn't accidentally trigger project-switch.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload();
  };

  if (iconOnly) {
    return (
      <Button
        size="icon"
        variant="outline"
        className={cn("h-7", className)}
        title="Download local copy"
        disabled={busy}
        onClick={handleClick}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("h-7 gap-1.5 text-xs", className)}
      title="Download local copy"
      disabled={busy}
      onClick={handleClick}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      Download
    </Button>
  );
}
