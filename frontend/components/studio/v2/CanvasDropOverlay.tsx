/**
 * CanvasDropOverlay — kind-aware drop-target chrome shown over the
 * canvas while a recognised drag is in progress. Renders a soft glow
 * around the canvas + a centred badge with the action label so the
 * user knows what dropping will do before they release.
 *
 * Per the standing DRY rule: every drop target that wants this chrome
 * mounts THIS component and lets `DRAG_KIND_META` decide the label +
 * accent. No drop-target re-rolls "drop to add widget" copy locally.
 *
 * Self-gating: when `kind` is null the overlay renders nothing, so
 * consumers can mount it unconditionally inside their drop-target div.
 */
import {
  DRAG_KIND_META,
  type DragKind,
} from "@/lib/studio/editor-v2/drag-protocol";
import { cn } from "@/lib/utils";

export interface CanvasDropOverlayProps {
  /** Drag kind currently hovering over the target. `null` hides the
   *  overlay entirely — caller can mount unconditionally. */
  kind: DragKind | null;
  className?: string;
}

/** Maps the accent token from DRAG_KIND_META to the concrete Tailwind
 *  classes we use for the ring + badge tint. Single mapping keeps the
 *  Tailwind JIT happy (it can't see `ring-${accent}` strings). */
const ACCENT_CLASSES: Record<
  ReturnType<() => (typeof DRAG_KIND_META)[DragKind]["accent"]>,
  { ring: string; badge: string }
> = {
  "brand-primary": {
    ring: "ring-brand-primary/70",
    badge: "bg-brand-primary text-white",
  },
  "sky-500": {
    ring: "ring-sky-500/70",
    badge: "bg-sky-500 text-white",
  },
  "emerald-500": {
    ring: "ring-emerald-500/70",
    badge: "bg-emerald-500 text-white",
  },
  "amber-500": {
    ring: "ring-amber-500/80",
    badge: "bg-amber-500 text-black",
  },
  "rose-500": {
    ring: "ring-rose-500/70",
    badge: "bg-rose-500 text-white",
  },
  "indigo-500": {
    ring: "ring-primary/70",
    badge: "bg-primary text-primary-foreground",
  },
};

export default function CanvasDropOverlay({
  kind,
  className,
}: CanvasDropOverlayProps) {
  if (!kind) return null;
  const meta = DRAG_KIND_META[kind];
  const accent = ACCENT_CLASSES[meta.accent];
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center",
        // Ring sits on the drop-target's outer edge so the user sees
        // the whole valid drop region at a glance.
        "rounded-sm ring-4 ring-offset-2",
        accent.ring,
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg",
          accent.badge,
        )}
      >
        {meta.label}
      </span>
    </div>
  );
}
