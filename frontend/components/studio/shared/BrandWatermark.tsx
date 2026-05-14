/**
 * "hired.video" corner watermark pill — the same brand chrome the v1
 * canvas renderer paints via `drawWatermark()` in
 * [frame-renderer.ts](hired.video/frontend/lib/renderer/frame-renderer.ts).
 * Surfaced as a React component so v2's preview overlay + canvas
 * preview can show it without re-implementing the layout math.
 *
 * Self-gates via `useSubscription().isPro` + the project-level
 * `removeBrandingFlag` (single source of truth lives in
 * [branding-policy.ts](hired.video/frontend/lib/studio/branding-policy.ts)).
 * Consumers don't pass a `showWatermark` boolean — the component
 * decides its own visibility per the DRY rule.
 *
 * Render path (export) still draws the pill on the canvas pixel
 * buffer; this component is the ON-SCREEN preview surface only.
 */
import { useSubscription } from "@/lib/hooks/useSubscription";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { cn } from "@/lib/utils";

export interface BrandWatermarkProps {
  /** Project-level "remove branding" flag. Honoured only for Pro users
   *  per the shared branding policy. Defaults to `false` (i.e. show
   *  branding) so callers that don't track the flag still get the
   *  free-tier behaviour. */
  removeBrandingFlag?: boolean;
  /** Size variant — `"sm"` for inline canvas, `"md"` for the larger
   *  fullscreen preview overlay. */
  size?: "sm" | "md";
  className?: string;
}

export default function BrandWatermark({
  removeBrandingFlag = false,
  size = "md",
  className,
}: BrandWatermarkProps) {
  const { isPro } = useSubscription();
  if (!shouldShowBranding({ isPro, removeBrandingFlag })) return null;
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
