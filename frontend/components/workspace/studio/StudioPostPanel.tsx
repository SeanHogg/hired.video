/**
 * StudioPostPanel — a studio format's Post panel, shown in the workspace's
 * right slot (the header's Post opens it; `?share=1` opens it on load). The
 * content is the shared SharePanelBody; the logic is useSharePanel;
 * publishing reuses the format's publish handlers. The slot titles it, so
 * the body's own heading is for screen readers only.
 */
import type { ReactNode } from "react";
import type { PublishHandlers } from "@/lib/studio/use-publish-handlers";
import type { MediaKind } from "@shared/media-kinds";
import SharePanelBody from "@/components/studio/v2/focus/SharePanelBody";
import { useSharePanel } from "@/components/studio/v2/focus/useSharePanel";
import type { VideoFrame } from "@/components/studio/v2/focus/useChannelFit";

interface StudioPostPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaKind: MediaKind;
  title: string;
  publisher: PublishHandlers;
  projectId: string | null;
  durationSec?: number | null;
  /** Output frame size (each network's aspect check). */
  frame?: VideoFrame | null;
}

function SrHeading({ children }: { className?: string; children: ReactNode }) {
  return <h2 className="sr-only">{children}</h2>;
}

export default function StudioPostPanel({ open, onOpenChange, mediaKind, title, publisher, projectId, durationSec, frame }: StudioPostPanelProps) {
  const share = useSharePanel({ open, onOpenChange, mediaKind, title, publisher, projectId, durationSec, frame });
  return (
    <div className="flex flex-col gap-3.5 p-4 text-foreground">
      <SharePanelBody share={share} Heading={SrHeading} onNavigate={() => onOpenChange(false)} />
    </div>
  );
}
