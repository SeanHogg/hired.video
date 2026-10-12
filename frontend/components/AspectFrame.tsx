/**
 * AspectFrame — shared aspect-ratio wrapper.
 *
 * Single source of truth for "render a child inside a box with a known
 * width:height ratio". Used by:
 *   • <StudioVideoSurface> for every embed surface (public page, hero
 *     spotlight, thumbnail tiles, profile/resume sections).
 *   • Studio's preview canvas wrapper (when we wire it).
 *
 * Accepts the ratio as either a number (1.7777…) or a `"W:H"` string
 * ("16:9", "9:16", "1:1", "4:3"). Either form is parsed via the shared
 * `parseAspectRatio` helper so the same input format that's persisted
 * on the studio script (`video.aspect`) flows straight in.
 *
 * Defaults to 16:9 on missing / invalid input — matches the historical
 * hardcoded `aspect-video` behaviour, so dropping this in is safe.
 */

import { cn } from "@/lib/utils";
import { parseAspectRatio, type AspectRatioInput } from "@/lib/studio/aspect";

interface AspectFrameProps {
  /** Numeric (1.777) or "W:H" string ("16:9"). Defaults to 16:9 on missing. */
  ratio?: AspectRatioInput;
  className?: string;
  children: React.ReactNode;
}

export default function AspectFrame({ ratio, className, children }: AspectFrameProps) {
  const numericRatio = parseAspectRatio(ratio);
  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: numericRatio }}
    >
      {children}
    </div>
  );
}
