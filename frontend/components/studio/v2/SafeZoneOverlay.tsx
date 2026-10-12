/**
 * SafeZoneOverlay — dashed rectangles drawn over the authoring canvas
 * marking destination-specific safe areas (TikTok/Reels caption band,
 * SMPTE 90% action-safe, outdoor-billboard bleed-safe). Per the standing
 * DRY rule, the component self-gates: it returns null when the active
 * canvas mode is playback (the overlay is an editor-only affordance and
 * must never leak into rendered output / `/v/<id>` / template previews)
 * or when the active format has no `safeZones` declared. Consumers
 * always mount it and never write a `{isEditing && hasZones && …}` guard.
 *
 * Pointer events are off so the overlay never interferes with widget
 * drag / select / resize. The zones are presentation-only — there is no
 * runtime enforcement that widgets stay inside them, by design (users
 * may want to bleed text past safe edges intentionally).
 */
import { findFormatByDimensions, safeZonesForFormat } from "@/lib/studio/video-formats";
import { useSafeZonePreference } from "@/lib/studio/editor-v2/use-safe-zone-pref";
import { displayAdSafeZones } from "@/lib/ads/iab-safe-zones";

interface SafeZoneOverlayProps {
  /** Unscaled canvas dimensions in pixels. The overlay positions zones as
   *  fractional insets so it scales with the surrounding `transform:
   *  scale(zoom)` wrapper without per-zoom math here. */
  canvasWidth: number;
  canvasHeight: number;
  /** Active canvas mode. The overlay only paints in `"edit"` — in
   *  `"playback"` it returns null so the dashed guide never appears in
   *  rendered output, the editor's play-mode preview, the public watch
   *  page, or the marketplace template player. */
  mode: "edit" | "playback";
}

const ZONE_COLOR: Record<string, string> = {
  "action-safe": "rgba(34, 197, 94, 0.7)",
  "title-safe": "rgba(234, 179, 8, 0.7)",
  "platform-ui": "rgba(244, 114, 182, 0.7)",
};

export default function SafeZoneOverlay({
  canvasWidth,
  canvasHeight,
  mode,
}: SafeZoneOverlayProps) {
  // #855 — user-controllable: hidden when the editor preference is off.
  // Read unconditionally (hooks rule); the early returns below are fine
  // because they come after the hook call.
  const [showSafeZones] = useSafeZonePreference();
  if (mode === "playback" || !showSafeZones) return null;
  const format = findFormatByDimensions(canvasWidth, canvasHeight);
  // #856 — derive zones by aspect when the format doesn't hand-declare
  // them, so 720p / 4K / square presets show guides too.
  // #1131 — IAB display-ad presets ship with empty `safeZones[]`; fall
  // back to GDN / tap-target insets so banner authoring still gets guides.
  const catalogZones = safeZonesForFormat(format);
  const zones =
    catalogZones.length > 0
      ? catalogZones
      : displayAdSafeZones(canvasWidth, canvasHeight);
  if (zones.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {zones.map((zone, idx) => {
        const left = zone.inset.left * 100;
        const top = zone.inset.top * 100;
        const right = zone.inset.right * 100;
        const bottom = zone.inset.bottom * 100;
        const color = ZONE_COLOR[zone.kind] ?? "rgba(255, 255, 255, 0.5)";
        return (
          <div
            key={`${zone.kind}-${idx}`}
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              right: `${right}%`,
              bottom: `${bottom}%`,
              border: `1px dashed ${color}`,
              boxShadow: `inset 0 0 0 1px rgba(0, 0, 0, 0.2)`,
            }}
          >
            <span
              className="absolute -top-4 left-0 rounded-sm px-1 text-[10px] font-medium uppercase tracking-wide"
              style={{ color, background: "rgba(0, 0, 0, 0.55)" }}
            >
              {zone.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
