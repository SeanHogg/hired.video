/**
 * DrawingPlaceholderThumbnail — Photoshop-shaped placeholder used in
 * two surfaces:
 *   • TemplateThumb's `drawing_*` branch (catalog card preview)
 *   • VideoProjectThumbnail's image-kind branch when the project has
 *     no drawn layers yet ("My videos" grid tile for a fresh drawing)
 *
 * Per the DRY rule (`feedback_extract_on_duplication`) the same visual
 * lives ONCE here — both consumers pick from the per-template preset
 * registry (when on the catalog grid) or read from the project's
 * `imageState.width / .height` (when on a project tile) and hand the
 * resolved dimensions + accent to this component.
 *
 * Visual: a centred white "artboard" with transparent-checker, two
 * stacked layer rectangles + a tilted brush mark + a small dimension
 * chip in the corner. Aspect ratio matches the supplied width/height
 * so square (1080×1080) vs landscape (1200×630) canvases read
 * distinctly at thumbnail size.
 */

import { cn } from "@/lib/utils";

export interface DrawingPlaceholderThumbnailProps {
  /** Canvas width in pixels — drives the inner artboard aspect. */
  width: number;
  /** Canvas height in pixels — drives the inner artboard aspect. */
  height: number;
  /** Accent colour for the stacked layer rectangles + dimension chip.
   *  Defaults to a neutral slate so a project tile that doesn't supply
   *  a kind palette still reads coherently. */
  accent?: string;
  /** Optional dimension label rendered as a chip in the corner ("1080
   *  · square", "1200 × 630"). When omitted the chip is suppressed —
   *  catalog cards always pass one; project tiles can omit since the
   *  card already shows project name + date below the thumbnail. */
  dimensionLabel?: string;
  className?: string;
}

const DEFAULT_ACCENT = "#94a3b8";

export default function DrawingPlaceholderThumbnail({
  width,
  height,
  accent = DEFAULT_ACCENT,
  dimensionLabel,
  className,
}: DrawingPlaceholderThumbnailProps) {
  const innerAspect = `${width} / ${height}`;
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-muted p-3",
        className,
      )}
    >
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-slate-300"
        style={{ aspectRatio: innerAspect, width: "100%" }}
      >
        {/* Transparent-checker hint — communicates "this is a raster
            canvas with layers" at a glance. */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
          }}
        />
        <div
          className="absolute left-[12%] top-[18%] h-[55%] w-[55%] rounded-sm opacity-90"
          style={{ backgroundColor: accent }}
        />
        <div
          className="absolute right-[10%] bottom-[12%] h-[45%] w-[45%] rounded-full opacity-80"
          style={{ backgroundColor: accent, filter: "brightness(0.7)" }}
        />
        {/* Brush bristle — tilted line in the top-right. */}
        <div
          className="absolute right-[20%] top-[20%] h-[3px] w-[28%] rotate-[20deg] rounded-full opacity-90"
          style={{ backgroundColor: "#111827" }}
        />
      </div>
      {dimensionLabel && (
        <div
          className="absolute bottom-1 right-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white shadow-sm"
          style={{ backgroundColor: accent, filter: "brightness(0.75)" }}
        >
          {dimensionLabel}
        </div>
      )}
    </div>
  );
}
