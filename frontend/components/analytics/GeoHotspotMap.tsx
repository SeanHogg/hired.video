/**
 * GeoHotspotMap — equirectangular world map with one circle per country
 * sized by view count. Lives in components/analytics so every artifact
 * (video, resume, article, …) can drop it into its <MetricsPanel/>
 * without a per-surface implementation.
 *
 * Why a hand-rolled SVG rather than `react-simple-maps` / `d3-geo`:
 * the panel needs to ship in the studio bundle and the editor is
 * already lazy-loading several heavy chunks. A 4 KB outline + a
 * centroid lookup is enough for the "where did views come from"
 * question we're answering here — anything fancier (state-level,
 * choropleth) would belong in a dedicated drill-in surface.
 */

import { useMemo, useState } from "react";

import { Globe } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ArtifactCountry } from "@/lib/analytics/artifact-metrics";
import { lookupCountry } from "./country-centroids";

// Equirectangular projection — lon -180..180 → x 0..VIEW_W, lat 90..-90 → y 0..VIEW_H.
const VIEW_W = 720;
const VIEW_H = 360;

function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: ((lon + 180) / 360) * VIEW_W,
    y: ((90 - lat) / 180) * VIEW_H,
  };
}

/**
 * Continents outline as a single SVG path in equirectangular pixel
 * space (matches VIEW_W × VIEW_H above). Hand-simplified silhouette —
 * the goal is to give viewers a "this is roughly the world" anchor for
 * the country dots, not a geopolitical reference. Coordinates are
 * deliberately coarse to keep the bundle small.
 */
const CONTINENTS_PATH = [
  // North America
  "M 130 90 L 200 70 L 260 78 L 290 100 L 280 130 L 240 160 L 195 170 L 175 195 L 155 195 L 140 170 L 130 130 Z",
  // Central America + Caribbean
  "M 215 180 L 250 200 L 245 220 L 220 215 L 210 195 Z",
  // South America
  "M 240 220 L 285 220 L 305 265 L 295 320 L 270 340 L 250 320 L 245 280 Z",
  // Europe
  "M 360 80 L 415 75 L 430 105 L 410 130 L 385 130 L 365 115 Z",
  // Africa
  "M 380 145 L 440 150 L 460 195 L 445 250 L 420 280 L 395 270 L 380 220 L 375 180 Z",
  // Middle East
  "M 445 130 L 480 140 L 485 165 L 460 175 L 445 160 Z",
  // Asia
  "M 440 80 L 565 65 L 620 100 L 605 145 L 555 165 L 510 155 L 470 130 L 445 110 Z",
  // South Asia / India
  "M 510 155 L 540 160 L 545 195 L 520 205 L 505 185 Z",
  // Southeast Asia
  "M 555 175 L 605 180 L 615 215 L 580 230 L 555 215 Z",
  // Australia
  "M 590 245 L 650 245 L 660 285 L 620 305 L 590 290 Z",
  // Greenland
  "M 320 50 L 360 45 L 365 80 L 335 85 L 320 70 Z",
].join(" ");

interface Props {
  countries: ArtifactCountry[];
  /** Total views — used to derive each circle's relative weight. When
   *  omitted we fall back to the sum of `countries[].views`. */
  totalViews?: number;
  /** Hide the wrapping <Card/> so the map embeds inline elsewhere. */
  bare?: boolean;
}

/** Hotspot circle radius (in px of viewBox). Uses a sqrt scale so a
 *  10× larger country doesn't render as a 10×-radius blob that
 *  swallows its neighbours. Clamped to [3, 22] for legibility. */
function circleRadius(views: number, maxViews: number): number {
  if (views <= 0 || maxViews <= 0) return 0;
  const scale = Math.sqrt(views / maxViews);
  return Math.max(3, Math.min(22, 3 + scale * 19));
}

export default function GeoHotspotMap({ countries, totalViews, bare }: Props) {
  // Hover state for tooltip — kept local so the parent doesn't need to
  // care about pointer interactions.
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  const { plotted, unknown, maxViews, grandTotal } = useMemo(() => {
    let unknownViews = 0;
    const plotted: Array<{
      code: string;
      name: string;
      views: number;
      x: number;
      y: number;
    }> = [];
    for (const row of countries) {
      const lookup = lookupCountry(row.country);
      if (!lookup) {
        unknownViews += row.views;
        continue;
      }
      const { x, y } = project(lookup.lat, lookup.lon);
      plotted.push({ code: row.country, name: lookup.name, views: row.views, x, y });
    }
    plotted.sort((a, b) => b.views - a.views);
    const max = plotted.reduce((m, r) => Math.max(m, r.views), 0);
    const total = totalViews ?? countries.reduce((s, r) => s + r.views, 0);
    return { plotted, unknown: unknownViews, maxViews: max, grandTotal: total };
  }, [countries, totalViews]);

  const body = (
    <div className="space-y-3">
      {countries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No location data available yet.
        </p>
      ) : (
        <>
          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="w-full h-auto rounded-md bg-muted/30"
              role="img"
              aria-label="World map showing viewer origin hotspots"
              onMouseLeave={() => setHover(null)}
            >
              {/* Equator + meridian for orientation. Subtle — purely
                  visual anchor since we're showing dots on a blank
                  background. */}
              <line
                x1={0}
                y1={VIEW_H / 2}
                x2={VIEW_W}
                y2={VIEW_H / 2}
                className="stroke-muted-foreground/20"
                strokeWidth={0.5}
              />
              <line
                x1={VIEW_W / 2}
                y1={0}
                x2={VIEW_W / 2}
                y2={VIEW_H}
                className="stroke-muted-foreground/20"
                strokeWidth={0.5}
              />

              {/* Continents silhouette. */}
              <path
                d={CONTINENTS_PATH}
                className="fill-muted-foreground/20 stroke-muted-foreground/40"
                strokeWidth={0.5}
                strokeLinejoin="round"
              />

              {/* Hotspots, largest last so they paint on top. */}
              {[...plotted].reverse().map((c) => {
                const r = circleRadius(c.views, maxViews);
                return (
                  <g key={c.code} onMouseEnter={() => setHover({ code: c.code, x: c.x, y: c.y })}>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={r}
                      className="fill-primary/40 stroke-primary"
                      strokeWidth={1}
                    />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={Math.max(1.5, r * 0.3)}
                      className="fill-primary"
                    />
                  </g>
                );
              })}

              {/* Tooltip rendered inside the SVG so it inherits the
                  viewBox coords and sits over the active dot. */}
              {hover && (
                <g pointerEvents="none">
                  {(() => {
                    const c = plotted.find((p) => p.code === hover.code);
                    if (!c) return null;
                    const label = `${c.name} · ${c.views} view${c.views === 1 ? "" : "s"}`;
                    // Approximate width — SVG can't measure text without a DOM
                    // node, but 5.5 px per char is close enough at 11px.
                    const w = Math.max(60, label.length * 5.5 + 16);
                    const h = 18;
                    const x = Math.min(Math.max(c.x - w / 2, 4), VIEW_W - w - 4);
                    const y = Math.max(c.y - h - 6, 4);
                    return (
                      <>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={4}
                          className="fill-popover stroke-border"
                          strokeWidth={0.5}
                        />
                        <text
                          x={x + w / 2}
                          y={y + 12}
                          textAnchor="middle"
                          className="fill-popover-foreground"
                          fontSize={10}
                        >
                          {label}
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}
            </svg>
          </div>

          {/* Top-5 rollup beneath the map. Doubles as the screen-reader
              fallback for the dots above and as a quick "where exactly
              is that big circle" reference. */}
          <ul className="space-y-1 text-xs">
            {plotted.slice(0, 5).map((c) => {
              const pct = grandTotal > 0 ? Math.round((c.views / grandTotal) * 100) : 0;
              return (
                <li key={c.code} className="flex items-center justify-between gap-3">
                  <span className="truncate">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {c.views} view{c.views === 1 ? "" : "s"} ({pct}%)
                  </span>
                </li>
              );
            })}
            {unknown > 0 && (
              <li className="flex items-center justify-between gap-3 text-muted-foreground italic">
                <span>Unknown</span>
                <span className="tabular-nums">
                  {unknown} view{unknown === 1 ? "" : "s"}
                </span>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Viewer Locations
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
