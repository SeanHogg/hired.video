/**
 * ShareVideoDock — "Post your video" docked INLINE beside a video a surface is
 * showing (the kit Video tab), so posting never opens a second panel over
 * the page or navigates away from what the visitor is looking at.
 *
 * It is the studio's own Post dock (SharePanelBody + useSharePanel — channels,
 * connect, the plan's channel cap, caption, multi-post, the posted view),
 * driven by a publisher for a canvas held outside the editor
 * (useCanvasPublisher) and gated by the same guest-first rule as the editor
 * (useGuestAnonGate). The studio editor mounts the floating SharePanel with
 * its own publisher; every other "post this" surface mounts this.
 *
 *   <ShareVideoDock active={postShowing} title="Dana Okafor — video resume"
 *                   canvasState={canvas} ensureProjectId={kit.ensureProjectId} />
 *
 * Keep it MOUNTED while hidden (`active` false) — a post in flight lives in
 * the publisher.
 */
import { forwardRef, useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { AnonGateContext } from "@/lib/studio/anon-gate-context";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import { useCanvasPublisher, type UseCanvasPublisherArgs } from "@/lib/studio/use-canvas-publisher";
import { renderPublishToastAction } from "@/components/studio/share/publish-toast-action";
import { totalDurationSeconds, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import SharePanelBody from "@/components/studio/v2/focus/SharePanelBody";
import { useSharePanel } from "@/components/studio/v2/focus/useSharePanel";
import type { VideoFrame } from "@/components/studio/v2/focus/useChannelFit";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

export interface ShareVideoDockProps {
  /** The dock is on screen — loads connect state and saves the project for the caption helper. */
  active: boolean;
  /** Post title (YouTube title, profile listing name). */
  title: string;
  /** The canvas the surface is SHOWING — exactly what gets posted. */
  canvasState: CanvasState;
  /** See useCanvasPublisher — the project the canvas IS. */
  ensureProjectId: UseCanvasPublisherArgs["ensureProjectId"];
  /** Inside a titled panel (the workspace's right slot): no card, and the
   *  heading is for screen readers only. */
  bare?: boolean;
  /** Shown under the posted view (a kit's "What's next"). */
  afterPosted?: ReactNode;
}

const HEADING_ID = "share-video-dock-title";

function DockHeading({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2 id={HEADING_ID} className={className}>
      {children}
    </h2>
  );
}

function BareHeading({ children }: { className?: string; children: ReactNode }) {
  return (
    <h2 id={HEADING_ID} className="sr-only">
      {children}
    </h2>
  );
}

// The dock stays put while the auth sheet is up, so there is nothing to hide or reopen.
const noop = () => undefined;

const ShareVideoDock = forwardRef<HTMLElement, ShareVideoDockProps>(function ShareVideoDock(
  { active, title, canvasState, ensureProjectId, bare = false, afterPosted },
  ref,
) {
  const { user } = useAuth();
  const { value: gateValue, sheet: gateSheet } = useGuestAnonGate();
  const publisher = useCanvasPublisher({
    title,
    canvasState,
    ensureProjectId,
    renderToastAction: renderPublishToastAction,
  });
  const { save, savedProjectId } = publisher;

  // Anyone with a session (guest included) gets the project saved once the
  // dock is shown, so "Write it for me" has something to read. Signed-out
  // visitors save on their first post instead (that starts the guest session).
  useEffect(() => {
    if (active && user && !savedProjectId) void save().catch(() => undefined);
  }, [active, user, savedProjectId, save]);

  return (
    <AnonGateContext.Provider value={gateValue}>
      <DockBody
        ref={ref}
        active={active}
        title={title}
        publisher={publisher}
        projectId={savedProjectId}
        durationSec={canvasState ? totalDurationSeconds(canvasState) : null}
        frame={canvasState ? { width: canvasState.width, height: canvasState.height } : null}
        bare={bare}
        afterPosted={afterPosted}
      />
      <AuthGateSheet {...gateSheet} />
    </AnonGateContext.Provider>
  );
});

interface DockBodyProps {
  active: boolean;
  title: string;
  publisher: ReturnType<typeof useCanvasPublisher>;
  projectId: string | null;
  durationSec: number | null;
  frame: VideoFrame | null;
  bare: boolean;
  afterPosted?: ReactNode;
}

/** Inside the gate provider, so `useSharePanel` reads THIS dock's gate. */
const DockBody = forwardRef<HTMLElement, DockBodyProps>(function DockBody({ active, title, publisher, projectId, durationSec, frame, bare, afterPosted }, ref) {
  const share = useSharePanel({ open: active, onOpenChange: noop, mediaKind: "video", title, publisher, projectId, durationSec, frame });
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={HEADING_ID}
      className={
        bare
          ? "flex flex-col gap-3.5 p-4 text-foreground focus:outline-none"
          : "flex scroll-mt-4 flex-col gap-3.5 rounded-[18px] border border-border bg-card p-[18px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      }
    >
      <SharePanelBody share={share} Heading={bare ? BareHeading : DockHeading} onNavigate={noop} afterPosted={afterPosted} />
    </section>
  );
});

export default ShareVideoDock;
