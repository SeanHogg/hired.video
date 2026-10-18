/**
 * /api/map — pin data for the /map discovery page.
 *
 * Returns two pin layers in one request so the page only round-trips
 * once per filter change:
 *   • events: upcoming public events whose origin location has lat/lng,
 *             matching the bbox / radius filter.
 *   • people: users with `openToCoffee` enabled AND a home lat/lng.
 *
 * Geo + radius filter reuses `content_locations` for both: events
 * (entity_kind = 'event') and people (entity_kind = 'user_profile',
 * entity_id = users.id — the home location, mig 0631).
 * Per project_globe_details_owner_only.md, the popover drawer on the
 * frontend uses the existing `useEntityDetailsPermission` seam — this
 * endpoint just returns the pin metadata, not the full detail drawer.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { loadMapPins, type PinBox } from "../services/location/mapPins.js";

export const mapRoutes = new Hono<AppEnv>();

function parseFilter(c: any): PinBox | null {
  const minLat = c.req.query("minLat") ? Number(c.req.query("minLat")) : -90;
  const maxLat = c.req.query("maxLat") ? Number(c.req.query("maxLat")) : 90;
  const minLng = c.req.query("minLng") ? Number(c.req.query("minLng")) : -180;
  const maxLng = c.req.query("maxLng") ? Number(c.req.query("maxLng")) : 180;
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return null;
  }
  return { minLat, maxLat, minLng, maxLng };
}

// ─── GET /api/map — combined pins (events + people) ───────────────────
mapRoutes.get("/", async (c) => {
  const filter = parseFilter(c);
  if (!filter) return c.json(success({ events: [], people: [] }), 200);
  return c.json(success(await loadMapPins(filter)), 200);
});
