/**
 * WorkspaceFrame — THE layout of every workspace (a career kit's pages and
 * every studio format): header, (stepper), then the 450px left panel beside
 * the canvas, the 150px strip under the canvas, and the ONE right slot over
 * the canvas edge. Layout only: the regions are slots, the host fills them.
 *
 * The frame never changes with Simple | Advanced — regions keep their place
 * and size (workspace-frame.test.tsx). When the right slot is open, the
 * canvas pads by its width so the page re-centres in the visible area.
 *
 * Phones: the left panel turns into a bottom bar (WorkspaceLeftPanel), the
 * right slot into a bottom sheet (RightSlot), and `footer` (the kit's Next)
 * pins above the bar.
 */
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { useWorkspaceViewportLock } from "@/lib/dom/use-workspace-viewport-lock";
import type { ReactNode } from "react";
import { useIsWideWorkspace, useMediaQuery } from "@/hooks/use-media-query";

/** Room the canvas keeps beside the slide-out (the board pads slot + 16). */
const SLOT_GAP_PX = 16;
/** Below this a wide tool page overlays the canvas instead of squeezing it
 *  (at 1024px a 672px tool would leave ~50px of page). */
const ROOMY_QUERY = "(min-width: 1440px)";
const OVERLAY_FROM_PX = 600;

interface WorkspaceFrameProps {
  header: ReactNode;
  /** The kit stepper (absent for studio formats). */
  stepper?: ReactNode;
  /** A notice under the header (missing project, subject seed…). */
  banner?: ReactNode;
  /** WorkspaceLeftPanel. */
  rail: ReactNode;
  canvas: ReactNode;
  /** WorkspaceStrip, or null for formats with no time / pages. */
  strip?: ReactNode;
  /** RightSlot. */
  slot: ReactNode;
  /** Width the slot covers (0 = closed). */
  slotWidthPx: number;
  /** Phones only: pinned above the bottom bar (the kit's Next). */
  footer?: ReactNode;
  /** Dialogs / overlays / gates. */
  children?: ReactNode;
  /** Name of the editing region (screen readers). */
  label: string;
}

export default function WorkspaceFrame({
  header,
  stepper,
  banner,
  rail,
  canvas,
  strip,
  slot,
  slotWidthPx,
  footer,
  children,
  label,
}: WorkspaceFrameProps) {
  const wide = useIsWideWorkspace();
  const roomy = useMediaQuery(ROOMY_QUERY);
  // The frame owns the viewport: nothing outside it may scroll the page.
  useWorkspaceViewportLock(true);
  const pad = !wide || slotWidthPx === 0 || (slotWidthPx >= OVERLAY_FROM_PX && !roomy) ? 0 : slotWidthPx + SLOT_GAP_PX;
  return (
    <div data-workspace-frame className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {header}
      {stepper}
      {/* The app's own notice, kept off the app chrome the frame replaces. */}
      <EmailVerificationBanner />
      {banner}
      <div className="flex min-h-0 flex-1">
        {rail}
        <main aria-label={label} className="relative flex min-w-0 flex-1 flex-col bg-muted">
          <div className="relative min-h-0 flex-1">
            <div
              data-region="canvas"
              className="absolute inset-0 overflow-auto transition-[padding] duration-200"
              style={{ paddingRight: pad }}
            >
              {canvas}
            </div>
            {slot}
          </div>
          {strip}
          {footer && <div className="flex-none border-t border-border bg-card p-2 lg:hidden">{footer}</div>}
          {/* Room for the phone bottom bar (WorkspaceLeftPanel, fixed). */}
          <div aria-hidden="true" className="h-[calc(3.5rem+env(safe-area-inset-bottom))] flex-none lg:hidden" />
        </main>
      </div>
      {children}
    </div>
  );
}
