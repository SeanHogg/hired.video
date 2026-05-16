/**
 * CtaHotzonesOverlay — clickable anchors overlaid on a video player at
 * the fractional positions where a CTA widget was authored. The CTA
 * itself is baked into the MP4 pixels at render time, so visually
 * nothing changes; this overlay just makes the painted button
 * interactive again.
 *
 * Self-contained per the DRY rule:
 *   • Returns null when there are no hot-zones, no current time, or
 *     no zone is active — host pages can mount it unconditionally.
 *   • Owns its own visibility math (start/end window comparison) so
 *     callers don't pass a derived `visible` boolean per zone.
 *   • Owns the click handler: prevent default IS required so we can
 *     pause the host video before letting the new tab open.
 */

import type { CtaHotzone } from "@shared/cta-hotzones";

interface CtaHotzonesOverlayProps {
  hotzones: CtaHotzone[];
  /** Current playhead in seconds. The overlay returns null when
   *  undefined (haven't received a timeupdate yet). */
  currentTimeSec: number | undefined;
  /** Called BEFORE opening the URL in a new tab so the host can pause
   *  playback. The browser still opens the link via `window.open` —
   *  this is a side-effect hook, not a click interceptor. */
  onActivate?: (zone: CtaHotzone) => void;
}

export default function CtaHotzonesOverlay({
  hotzones,
  currentTimeSec,
  onActivate,
}: CtaHotzonesOverlayProps) {
  if (!hotzones.length) return null;
  if (typeof currentTimeSec !== "number") return null;

  const active = hotzones.filter(
    (z) => currentTimeSec >= z.startSec && currentTimeSec < z.endSec,
  );
  if (active.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {active.map((zone, i) => (
        <a
          key={`${zone.url}-${zone.startSec}-${i}`}
          href={zone.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onActivate?.(zone)}
          aria-label="Open call-to-action link"
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.w * 100}%`,
            height: `${zone.h * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
