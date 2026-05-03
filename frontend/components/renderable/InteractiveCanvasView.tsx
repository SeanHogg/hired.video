/**
 * InteractiveCanvasView — read-only renderer for an InteractiveCanvas.
 * Positions each `RenderableElement` by its % box on a relatively-sized
 * container, optionally with a background and aspect ratio.
 *
 * This is the single answer to "draw an interactive overlay on a host
 * record" used by Resume sub-records (Employment, Volunteer, Project,
 * Education, Certification), Company sections, Profile sections, Job
 * postings — and any future host. The studio's video preview composes
 * many of these in sequence (one per scene); host pages render one per
 * record. Same data, same component.
 *
 * Self-contained per the DRY rule:
 *   • Returns null when the canvas is empty / undefined / malformed
 *     (uses `isInteractiveCanvas` so the gate logic isn't repeated
 *     in every host).
 *   • Owns its own aspect-ratio framing via `<AspectFrame>` so hosts
 *     don't have to guess at sizing.
 *   • Sorts elements by `z` so authoring order is irrelevant.
 */

import AspectFrame from "@/components/AspectFrame";
import RenderableElementView from "@/components/renderable/RenderableElementView";
import { isInteractiveCanvas, type InteractiveCanvas } from "@/types/renderable-element";
import { cn } from "@/lib/utils";

interface InteractiveCanvasViewProps {
  /** May be undefined / malformed — the component self-gates. */
  canvas: InteractiveCanvas | null | undefined;
  /** When omitted the canvas's own aspect ratio (or 16:9) is used.
   *  Pass a number / "W:H" string to override per host. */
  aspectRatio?: number | string;
  className?: string;
}

export default function InteractiveCanvasView({
  canvas,
  aspectRatio,
  className,
}: InteractiveCanvasViewProps) {
  if (!isInteractiveCanvas(canvas)) return null;
  if (canvas.elements.length === 0) return null;

  // Authoring order shouldn't dictate stacking — `z` does. Stable sort
  // so equal-z elements keep their declared order.
  const elements = [...canvas.elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const ratio = aspectRatio ?? canvas.aspect;

  return (
    <AspectFrame
      ratio={ratio}
      className={cn("relative", className)}
    >
      {canvas.background && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: canvas.background }}
        />
      )}
      {elements.map((el) => (
        <RenderableElementView key={el.id} element={el} position="absolute" />
      ))}
    </AspectFrame>
  );
}
