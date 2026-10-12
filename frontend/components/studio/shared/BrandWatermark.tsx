/**
 * "hired.video" corner watermark pill — the DOM twin of the pill the
 * export paints via `drawWatermark()` in
 * [watermark.ts](hired.video/frontend/lib/timeline/watermark.ts).
 * Mounted over DOM-rendered canvas previews; the fullscreen preview
 * overlay renders frames through the export compositor, which paints
 * the real pill itself.
 *
 * Self-gates per the DRY rule through `useShowBranding()` (plan + the
 * remove-branding toggle), never accepting either as a prop. Consumers
 * just mount `<BrandWatermark />` — the branding policy is the single
 * source of truth.
 *
 * Render path (export) still draws the pill on the canvas pixel
 * buffer; this component is the ON-SCREEN preview surface only.
 */
import { useShowBranding } from "@/lib/studio/use-show-branding";
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
  if (!useShowBranding()) return null;
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
      <span className="text-[#60a5fa]">.video</span>
    </div>
  );
}
