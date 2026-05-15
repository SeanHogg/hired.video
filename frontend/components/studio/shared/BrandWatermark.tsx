/**
 * "hired.video" corner watermark pill — the same brand chrome the v1
 * canvas renderer paints via `drawWatermark()` in
 * [frame-renderer.ts](hired.video/frontend/lib/renderer/frame-renderer.ts).
 * Surfaced as a React component so v2's preview overlay + canvas
 * preview can show it without re-implementing the layout math.
 *
 * Self-gates per the DRY rule: reads `useSubscription().isPro` AND
 * `useRemoveBrandingFlag().removeBranding` directly, never accepting
 * either as a prop. Consumers just mount `<BrandWatermark />` — the
 * branding policy is the single source of truth.
 *
 * Render path (export) still draws the pill on the canvas pixel
 * buffer; this component is the ON-SCREEN preview surface only.
 */
import { useSubscription } from "@/lib/hooks/useSubscription";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import { cn } from "@/lib/utils";

export interface BrandWatermarkProps {
  /** Size variant — `"sm"` for inline canvas, `"md"` for the larger
   *  fullscreen preview overlay. */
  size?: "sm" | "md";
  className?: string;
}

export default function BrandWatermark({
  size = "md",
  className,
}: BrandWatermarkProps) {
  const { isPro } = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();
  if (!shouldShowBranding({ isPro, removeBrandingFlag: removeBranding })) return null;
  return (
    <div
      className={cn(
        "pointer-events-none flex select-none items-center rounded-full bg-black/55 font-bold tracking-tight backdrop-blur-sm",
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-4 py-1.5 text-base",
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-white">hired</span>
      <span className="text-[#a78bfa]">.video</span>
    </div>
  );
}
