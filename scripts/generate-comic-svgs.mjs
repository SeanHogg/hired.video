#!/usr/bin/env node
/**
 * Stock SVG generator for the comic studio.
 *
 * Single-shot script: writes the SVG library declared in
 * `shared/comic-genres.ts` to `frontend/public/comics/<genre>/`. Each
 * SVG is parametric on the genre palette so re-running with a tweaked
 * palette regenerates the whole library in one pass.
 *
 * NOT imported at runtime — invoke manually after editing the asset
 * manifest:
 *
 *     node scripts/generate-comic-svgs.mjs
 *
 * Why a script and not a build step: the SVGs are committed to the
 * repo so the Vite dev server can serve them as static assets. A build
 * step would couple `pnpm dev` to a generator pass for content that
 * rarely changes.
 *
 * Why parametric generators here instead of inline files: 96+ SVGs
 * would be 96+ Write calls — the manifest below ships ~12 reusable
 * primitives (city skyline / detective silhouette / scroll / star
 * burst / …) parametrised on the genre palette. Adding a new genre is
 * one palette block in `comic-genres.ts` plus a re-run.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_ROOT = path.resolve(__dirname, "..", "frontend", "public", "comics");

// ─── Genre palettes ──────────────────────────────────────────────────────────
// Mirror of `shared/comic-genres.ts` palette values. Kept in sync by re-run
// after editing the canonical catalog (the script reads the manifest, the
// manifest reads the palette).

const PALETTES = {
  hero:       { paper: "#fff7ed", ink: "#1c1917", primary: "#2563eb", secondary: "#dc2626", accent: "#facc15" },
  noir:       { paper: "#0a0a0a", ink: "#fafafa", primary: "#737373", secondary: "#fca5a5", accent: "#fbbf24" },
  scifi:      { paper: "#0f172a", ink: "#e0f2fe", primary: "#22d3ee", secondary: "#a855f7", accent: "#fde047" },
  fantasy:    { paper: "#fef3c7", ink: "#451a03", primary: "#7c2d12", secondary: "#065f46", accent: "#b45309" },
  romance:    { paper: "#fff1f2", ink: "#831843", primary: "#ec4899", secondary: "#f43f5e", accent: "#fbcfe8" },
  slice:      { paper: "#fefce8", ink: "#1f2937", primary: "#84cc16", secondary: "#06b6d4", accent: "#f59e0b" },
  manga:      { paper: "#ffffff", ink: "#0a0a0a", primary: "#dc2626", secondary: "#1d4ed8", accent: "#fde047" },
  horror:     { paper: "#18181b", ink: "#e7e5e4", primary: "#7f1d1d", secondary: "#1e293b", accent: "#a3e635" },
  comedy:     { paper: "#ecfeff", ink: "#0c4a6e", primary: "#f97316", secondary: "#a855f7", accent: "#facc15" },
  retro80s:   { paper: "#1e1b4b", ink: "#f0abfc", primary: "#f472b6", secondary: "#22d3ee", accent: "#fbbf24" },
  webtoon:    { paper: "#ffffff", ink: "#27272a", primary: "#6366f1", secondary: "#14b8a6", accent: "#fb7185" },
  adventure:  { paper: "#fef3c7", ink: "#1c1917", primary: "#b45309", secondary: "#166534", accent: "#dc2626" },
};

// ─── SVG primitive helpers ──────────────────────────────────────────────────
// Each function returns the inner markup of an `<svg>` element. The
// caller wraps with the appropriate viewBox and dimensions.

function wrap(viewBox, inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice">
${inner}
</svg>
`;
}

// ─── Background generators ──────────────────────────────────────────────────

const bg = {
  /** Stylised city skyline against a gradient sky — used by hero, noir
   *  (recoloured by palette), and as the base of several other genres. */
  skyline(p) {
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.primary}" stop-opacity="0.85"/>
      <stop offset="65%" stop-color="${p.paper}"/>
      <stop offset="100%" stop-color="${p.accent}" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <circle cx="640" cy="120" r="46" fill="${p.accent}" opacity="0.9"/>
  <g fill="${p.ink}" opacity="0.92">
    <rect x="20"  y="240" width="80"  height="210"/>
    <rect x="110" y="200" width="60"  height="250"/>
    <rect x="180" y="260" width="50"  height="190"/>
    <rect x="240" y="180" width="100" height="270"/>
    <rect x="350" y="230" width="70"  height="220"/>
    <rect x="430" y="160" width="90"  height="290"/>
    <rect x="530" y="220" width="60"  height="230"/>
    <rect x="600" y="190" width="80"  height="260"/>
    <rect x="690" y="240" width="90"  height="210"/>
  </g>
  <g fill="${p.accent}" opacity="0.7">
    <rect x="34"  y="270" width="8" height="8"/>
    <rect x="50"  y="290" width="8" height="8"/>
    <rect x="130" y="240" width="8" height="8"/>
    <rect x="260" y="220" width="8" height="8"/>
    <rect x="290" y="260" width="8" height="8"/>
    <rect x="450" y="200" width="8" height="8"/>
    <rect x="480" y="240" width="8" height="8"/>
    <rect x="540" y="260" width="8" height="8"/>
    <rect x="620" y="230" width="8" height="8"/>
    <rect x="700" y="280" width="8" height="8"/>
  </g>
`);
  },
  /** Radial speed-line burst — pure action backdrop. */
  burst(p) {
    const lines = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const x1 = 400 + Math.cos(a) * 60;
      const y1 = 225 + Math.sin(a) * 60;
      const x2 = 400 + Math.cos(a) * 360;
      const y2 = 225 + Math.sin(a) * 360;
      lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${p.ink}" stroke-width="4"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.accent}"/>
  ${lines.join("\n  ")}
  <circle cx="400" cy="225" r="48" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>
`);
  },
  /** Halftone dot field — pop-art texture overlay. */
  halftone(p) {
    const dots = [];
    for (let y = 10; y < 450; y += 20) {
      for (let x = 10; x < 800; x += 20) {
        dots.push(`<circle cx="${x}" cy="${y}" r="${(x % 40 === 10 ? 5 : 3)}" fill="${p.ink}" opacity="0.5"/>`);
      }
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${dots.join("\n  ")}
`);
  },
  /** Rainy street — noir staple. */
  rainStreet(p) {
    const rain = [];
    for (let i = 0; i < 80; i++) {
      const x = (i * 97) % 800;
      const y = (i * 53) % 450;
      rain.push(`<line x1="${x}" y1="${y}" x2="${x - 12}" y2="${y + 24}" stroke="${p.ink}" stroke-width="1.5" opacity="0.7"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="320" width="800" height="130" fill="${p.primary}" opacity="0.4"/>
  <path d="M 0,320 L 800,320 L 800,360 L 0,360 Z" fill="${p.ink}" opacity="0.6"/>
  <ellipse cx="200" cy="120" rx="20" ry="60" fill="${p.accent}" opacity="0.4"/>
  <ellipse cx="600" cy="140" rx="14" ry="70" fill="${p.secondary}" opacity="0.4"/>
  ${rain.join("\n  ")}
`);
  },
  /** Venetian-blind light spilling across a dark room. */
  venetian(p) {
    const bars = [];
    for (let i = 0; i < 14; i++) {
      bars.push(`<rect x="0" y="${30 + i * 30}" width="800" height="14" fill="${p.ink}" opacity="0.55"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect width="800" height="450" fill="${p.accent}" opacity="0.18"/>
  ${bars.join("\n  ")}
`);
  },
  /** Smoke — soft layered shapes. */
  smoke(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <ellipse cx="180" cy="380" rx="240" ry="80" fill="${p.ink}" opacity="0.18"/>
  <ellipse cx="500" cy="320" rx="280" ry="60" fill="${p.ink}" opacity="0.22"/>
  <ellipse cx="650" cy="400" rx="200" ry="80" fill="${p.ink}" opacity="0.16"/>
  <ellipse cx="300" cy="250" rx="200" ry="50" fill="${p.ink}" opacity="0.12"/>
`);
  },
  /** Neon megacity — sci-fi vertical city with windows. */
  neonCity(p) {
    const windows = [];
    for (let i = 0; i < 30; i++) {
      const x = (i * 27) % 780;
      const y = 80 + (i * 43) % 320;
      windows.push(`<rect x="${x}" y="${y}" width="6" height="6" fill="${p.accent}" opacity="0.9"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <g fill="${p.primary}" opacity="0.85">
    <polygon points="40,450 40,180 120,150 120,450"/>
    <polygon points="140,450 140,90 220,60 220,450"/>
    <polygon points="240,450 240,200 320,180 320,450"/>
    <polygon points="340,450 340,40 420,20 420,450"/>
    <polygon points="450,450 450,140 530,120 530,450"/>
    <polygon points="560,450 560,200 640,170 640,450"/>
    <polygon points="660,450 660,90 740,60 740,450"/>
  </g>
  <g stroke="${p.secondary}" stroke-width="2" fill="none" opacity="0.7">
    <path d="M 0,300 L 800,300"/>
    <path d="M 0,330 L 800,330"/>
    <path d="M 0,360 L 800,360"/>
  </g>
  ${windows.join("\n  ")}
`);
  },
  /** Circuit-board geometric pattern. */
  circuit(p) {
    const traces = [];
    for (let i = 0; i < 12; i++) {
      const y = 40 + i * 32;
      traces.push(`<path d="M 0,${y} L 200,${y} L 220,${y + 16} L 800,${y + 16}" stroke="${p.primary}" stroke-width="2" fill="none" opacity="0.6"/>`);
    }
    const nodes = [];
    for (let i = 0; i < 24; i++) {
      const x = 30 + (i % 8) * 100;
      const y = 50 + Math.floor(i / 8) * 130;
      nodes.push(`<circle cx="${x}" cy="${y}" r="4" fill="${p.accent}"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${traces.join("\n  ")}
  ${nodes.join("\n  ")}
`);
  },
  /** Holographic grid floor. */
  hologram(p) {
    const lines = [];
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const y = 225 + t * 225;
      const skew = t * 400;
      lines.push(`<line x1="${-skew}" y1="${y}" x2="${800 + skew}" y2="${y}" stroke="${p.primary}" stroke-width="${1 + t * 2}" opacity="${0.3 + t * 0.6}"/>`);
    }
    for (let i = -4; i < 14; i++) {
      const x = (i * 80) - 80;
      lines.push(`<line x1="${x}" y1="225" x2="${400 + (x - 400) * 5}" y2="450" stroke="${p.primary}" stroke-width="2" opacity="0.7"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <circle cx="400" cy="180" r="60" fill="${p.accent}" opacity="0.9"/>
  ${lines.join("\n  ")}
`);
  },
  /** Mountain pass — fantasy landscape. */
  mountain(p) {
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${p.accent}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${p.paper}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <circle cx="200" cy="120" r="40" fill="${p.accent}" opacity="0.95"/>
  <polygon points="-20,450 120,260 250,310 380,200 540,290 680,220 820,450" fill="${p.secondary}" opacity="0.8"/>
  <polygon points="-20,450 100,330 220,360 350,300 480,350 600,310 820,450" fill="${p.primary}" opacity="0.9"/>
  <polygon points="0,450 800,450 800,400 0,400" fill="${p.ink}" opacity="0.85"/>
`);
  },
  /** Parchment paper background with frame. */
  parchment(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect x="0" y="0" width="800" height="20" fill="${p.ink}" opacity="0.08"/>
  <rect x="0" y="430" width="800" height="20" fill="${p.ink}" opacity="0.08"/>
  <g stroke="${p.ink}" stroke-width="3" fill="none" opacity="0.65">
    <rect x="20" y="20" width="760" height="410"/>
    <rect x="32" y="32" width="736" height="386"/>
  </g>
  <g fill="${p.primary}" opacity="0.25">
    <circle cx="80"  cy="80"  r="4"/>
    <circle cx="720" cy="80"  r="4"/>
    <circle cx="80"  cy="370" r="4"/>
    <circle cx="720" cy="370" r="4"/>
  </g>
`);
  },
  /** Castle on hill. */
  castle(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <path d="M 0,450 L 0,360 Q 400,260 800,360 L 800,450 Z" fill="${p.secondary}" opacity="0.6"/>
  <g fill="${p.ink}" opacity="0.92">
    <rect x="340" y="220" width="120" height="120"/>
    <rect x="320" y="200" width="40"  height="140"/>
    <rect x="440" y="200" width="40"  height="140"/>
    <polygon points="320,200 340,170 360,200"/>
    <polygon points="440,200 460,170 480,200"/>
    <polygon points="340,220 400,150 460,220"/>
    <rect x="386" y="270" width="28" height="50" fill="${p.accent}"/>
  </g>
`);
  },
  /** Petal shower — romance. */
  petals(p) {
    const petals = [];
    for (let i = 0; i < 40; i++) {
      const x = (i * 73) % 800;
      const y = (i * 53) % 450;
      const r = (i % 5) + 4;
      petals.push(`<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.6}" fill="${p.secondary}" opacity="0.7" transform="rotate(${(i * 17) % 360} ${x} ${y})"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${petals.join("\n  ")}
`);
  },
  /** Cafe interior — romance. */
  cafe(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="280" width="800" height="170" fill="${p.primary}" opacity="0.3"/>
  <g fill="${p.ink}" opacity="0.7">
    <rect x="100" y="80"  width="200" height="160" rx="6"/>
    <rect x="500" y="80"  width="200" height="160" rx="6"/>
    <rect x="120" y="100" width="40"  height="40"  fill="${p.accent}" opacity="0.8"/>
    <rect x="180" y="100" width="40"  height="40"  fill="${p.secondary}" opacity="0.7"/>
    <rect x="520" y="100" width="40"  height="40"  fill="${p.accent}" opacity="0.8"/>
    <rect x="580" y="100" width="40"  height="40"  fill="${p.secondary}" opacity="0.7"/>
  </g>
  <g fill="${p.secondary}" opacity="0.85">
    <circle cx="200" cy="340" r="20"/>
    <rect   x="195" y="340" width="10" height="40"/>
    <circle cx="600" cy="340" r="20"/>
    <rect   x="595" y="340" width="10" height="40"/>
  </g>
`);
  },
  /** Sunset rooftop — romance. */
  sunset(p) {
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="sun" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"  stop-color="${p.secondary}"/>
      <stop offset="55%" stop-color="${p.accent}"/>
      <stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sun)"/>
  <circle cx="400" cy="270" r="120" fill="${p.accent}" opacity="0.7"/>
  <rect y="380" width="800" height="70" fill="${p.ink}" opacity="0.85"/>
  <g fill="${p.ink}" opacity="0.92">
    <rect x="40"  y="240" width="60" height="180"/>
    <rect x="120" y="280" width="40" height="140"/>
    <rect x="640" y="220" width="60" height="200"/>
    <rect x="720" y="290" width="50" height="130"/>
  </g>
`);
  },
  /** Kitchen window — slice. */
  kitchenWindow(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect x="200" y="80" width="400" height="280" fill="${p.primary}" opacity="0.3" stroke="${p.ink}" stroke-width="4"/>
  <line x1="400" y1="80" x2="400" y2="360" stroke="${p.ink}" stroke-width="4"/>
  <line x1="200" y1="220" x2="600" y2="220" stroke="${p.ink}" stroke-width="4"/>
  <rect y="380" width="800" height="70" fill="${p.secondary}" opacity="0.5"/>
  <ellipse cx="640" cy="150" rx="40" ry="40" fill="${p.accent}" opacity="0.85"/>
`);
  },
  /** Park bench. */
  parkBench(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="280" width="800" height="170" fill="${p.primary}" opacity="0.45"/>
  <g fill="${p.ink}">
    <rect x="260" y="290" width="280" height="14"/>
    <rect x="260" y="310" width="280" height="14"/>
    <rect x="270" y="304" width="14"  height="64"/>
    <rect x="516" y="304" width="14"  height="64"/>
  </g>
  <g fill="${p.secondary}" opacity="0.6">
    <circle cx="120" cy="100" r="80"/>
    <circle cx="680" cy="120" r="100"/>
  </g>
`);
  },
  /** Morning desk. */
  morningDesk(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="280" width="800" height="170" fill="${p.primary}" opacity="0.3"/>
  <rect x="120" y="200" width="220" height="160" fill="${p.ink}" opacity="0.85" rx="6"/>
  <rect x="140" y="220" width="180" height="120" fill="${p.accent}" opacity="0.6"/>
  <circle cx="540" cy="320" r="30" fill="${p.secondary}" opacity="0.85"/>
  <rect x="510" y="320" width="60" height="20" fill="${p.secondary}" opacity="0.85"/>
  <rect x="600" y="280" width="80" height="80" fill="${p.accent}" opacity="0.7" rx="4"/>
`);
  },
  /** Manga speed lines. */
  speedLines(p) {
    const lines = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const x1 = 400 + Math.cos(a) * 80;
      const y1 = 225 + Math.sin(a) * 50;
      const x2 = 400 + Math.cos(a) * 600;
      const y2 = 225 + Math.sin(a) * 400;
      lines.push(`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${p.ink}" stroke-width="${1 + (i % 3)}"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${lines.join("\n  ")}
  <ellipse cx="400" cy="225" rx="60" ry="38" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/>
`);
  },
  /** Manga screentone dot field. */
  screentone(p) {
    const dots = [];
    for (let y = 6; y < 450; y += 12) {
      for (let x = (y / 12) % 2 === 0 ? 6 : 12; x < 800; x += 12) {
        dots.push(`<circle cx="${x}" cy="${y}" r="2.5" fill="${p.ink}"/>`);
      }
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${dots.join("\n  ")}
`);
  },
  /** Training dojo. */
  dojo(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="320" width="800" height="130" fill="${p.primary}" opacity="0.55"/>
  <g stroke="${p.ink}" stroke-width="6" fill="none">
    <rect x="60"  y="40" width="680" height="280"/>
    <line x1="60" y1="120" x2="740" y2="120"/>
    <line x1="240" y1="40" x2="240" y2="320"/>
    <line x1="560" y1="40" x2="560" y2="320"/>
  </g>
  <circle cx="400" cy="100" r="36" fill="${p.secondary}" opacity="0.9"/>
`);
  },
  /** Old gothic house. */
  oldHouse(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="370" width="800" height="80" fill="${p.secondary}" opacity="0.45"/>
  <g fill="${p.ink}" opacity="0.95">
    <polygon points="200,150 400,40 600,150 600,370 200,370"/>
    <rect x="240" y="180" width="40" height="60" fill="${p.accent}" opacity="0.8"/>
    <rect x="520" y="180" width="40" height="60" fill="${p.accent}" opacity="0.8"/>
    <rect x="380" y="260" width="50" height="110" fill="${p.paper}"/>
    <rect x="378" y="258" width="54" height="6"/>
  </g>
  <circle cx="640" cy="80" r="40" fill="${p.paper}" opacity="0.65"/>
`);
  },
  /** Fog. */
  fog(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <g fill="${p.ink}" opacity="0.18">
    <ellipse cx="100" cy="200" rx="220" ry="60"/>
    <ellipse cx="380" cy="280" rx="280" ry="50"/>
    <ellipse cx="680" cy="180" rx="240" ry="70"/>
    <ellipse cx="500" cy="380" rx="320" ry="60"/>
  </g>
`);
  },
  /** Candlelight glow. */
  candle(p) {
    return wrap("0 0 800 450", `
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.6" r="0.5">
      <stop offset="0%"   stop-color="${p.accent}" stop-opacity="0.9"/>
      <stop offset="40%"  stop-color="${p.primary}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${p.paper}"   stop-opacity="0.95"/>
    </radialGradient>
  </defs>
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect width="800" height="450" fill="url(#glow)"/>
  <rect x="386" y="300" width="28" height="100" fill="${p.ink}"/>
  <ellipse cx="400" cy="290" rx="14" ry="22" fill="${p.accent}"/>
  <ellipse cx="400" cy="284" rx="6"  ry="12" fill="${p.paper}"/>
`);
  },
  /** Polka dots. */
  polka(p) {
    const dots = [];
    for (let y = 30; y < 450; y += 50) {
      for (let x = (y / 50) % 2 === 0 ? 30 : 55; x < 800; x += 50) {
        dots.push(`<circle cx="${x}" cy="${y}" r="14" fill="${p.secondary}" opacity="0.85"/>`);
      }
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${dots.join("\n  ")}
`);
  },
  /** Cartoon diagonal stripes. */
  stripes(p) {
    const bars = [];
    for (let i = -1; i < 24; i++) {
      bars.push(`<polygon points="${i * 60},0 ${i * 60 + 40},0 ${i * 60 - 200},450 ${i * 60 - 240},450" fill="${i % 2 === 0 ? p.primary : p.secondary}" opacity="${i % 2 === 0 ? 0.85 : 0.55}"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  ${bars.join("\n  ")}
`);
  },
  /** Cartoon office. */
  cartoonOffice(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="320" width="800" height="130" fill="${p.primary}" opacity="0.5"/>
  <g fill="${p.ink}" opacity="0.9">
    <rect x="60"  y="200" width="180" height="120" rx="10"/>
    <rect x="80"  y="220" width="140" height="80"  fill="${p.accent}" opacity="0.8"/>
    <rect x="560" y="180" width="180" height="140" rx="10"/>
    <rect x="580" y="200" width="140" height="100" fill="${p.secondary}" opacity="0.85"/>
    <rect x="320" y="240" width="160" height="80"  rx="6"/>
  </g>
`);
  },
  /** Retro grid sunset. */
  gridSunset(p) {
    const lines = [];
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      lines.push(`<line x1="${-200 - t * 600}" y1="${225 + t * 225}" x2="${1000 + t * 600}" y2="${225 + t * 225}" stroke="${p.primary}" stroke-width="2" opacity="${0.4 + t * 0.6}"/>`);
    }
    for (let i = -4; i < 14; i++) {
      const x = i * 80;
      lines.push(`<line x1="${x}" y1="225" x2="${400 + (x - 400) * 6}" y2="450" stroke="${p.primary}" stroke-width="2" opacity="0.7"/>`);
    }
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="sun" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"  stop-color="${p.primary}"/>
      <stop offset="60%" stop-color="${p.accent}"/>
      <stop offset="100%" stop-color="${p.paper}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="225" fill="url(#sun)"/>
  <circle cx="400" cy="200" r="100" fill="${p.accent}" opacity="0.95"/>
  <rect y="225" width="800" height="225" fill="${p.paper}"/>
  ${lines.join("\n  ")}
`);
  },
  /** Palm silhouettes. */
  palms(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect width="800" height="450" fill="${p.primary}" opacity="0.25"/>
  <g fill="${p.ink}" opacity="0.92">
    <rect x="60"  y="200" width="14" height="200"/>
    <path d="M 67,200 Q 0,180 -10,140 Q 30,160 67,190 Q 50,140 70,80 Q 88,150 67,200 Q 130,170 160,130 Q 130,180 67,200"/>
    <rect x="720" y="220" width="14" height="180"/>
    <path d="M 727,220 Q 670,200 660,160 Q 700,180 727,210 Q 710,160 730,100 Q 748,170 727,220 Q 790,190 810,150 Q 780,200 727,220"/>
  </g>
`);
  },
  /** VHS scanlines + glitch. */
  scanlines(p) {
    const bars = [];
    for (let y = 0; y < 450; y += 4) {
      bars.push(`<rect x="0" y="${y}" width="800" height="2" fill="${p.ink}" opacity="${(y / 4) % 8 === 0 ? 0.3 : 0.12}"/>`);
    }
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect width="800" height="450" fill="${p.primary}" opacity="0.18"/>
  ${bars.join("\n  ")}
`);
  },
  /** Soft gradient — webtoon. */
  gradient(p) {
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"   stop-color="${p.primary}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${p.accent}"  stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect width="800" height="450" fill="url(#g)"/>
`);
  },
  /** Indoor soft (webtoon). */
  indoorSoft(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="310" width="800" height="140" fill="${p.primary}" opacity="0.18"/>
  <rect x="180" y="80" width="220" height="220" fill="${p.secondary}" opacity="0.15" stroke="${p.ink}" stroke-width="2"/>
  <rect x="440" y="120" width="200" height="180" fill="${p.accent}" opacity="0.18" stroke="${p.ink}" stroke-width="2"/>
`);
  },
  /** Outdoor pastel (webtoon). */
  outdoorPastel(p) {
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"   stop-color="${p.primary}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${p.paper}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <ellipse cx="400" cy="430" rx="900" ry="160" fill="${p.secondary}" opacity="0.4"/>
  <circle cx="640" cy="120" r="44" fill="${p.accent}" opacity="0.9"/>
`);
  },
  /** Map overlay — adventure. */
  mapOverlay(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <path d="M 60,360 Q 200,300 300,340 T 500,240 T 700,180" stroke="${p.ink}" stroke-width="3" fill="none" stroke-dasharray="10 6"/>
  <g fill="${p.primary}">
    <circle cx="60"  cy="360" r="8"/>
    <circle cx="300" cy="340" r="8"/>
    <circle cx="500" cy="240" r="8"/>
    <circle cx="700" cy="180" r="8"/>
  </g>
  <polygon points="700,180 720,160 730,180 750,160 760,180 730,200" fill="${p.secondary}"/>
`);
  },
  /** Jungle. */
  jungle(p) {
    return wrap("0 0 800 450", `
  <rect width="800" height="450" fill="${p.paper}"/>
  <rect y="320" width="800" height="130" fill="${p.secondary}" opacity="0.6"/>
  <g fill="${p.primary}" opacity="0.85">
    <ellipse cx="120" cy="280" rx="120" ry="80"/>
    <ellipse cx="320" cy="260" rx="160" ry="100"/>
    <ellipse cx="520" cy="290" rx="140" ry="80"/>
    <ellipse cx="700" cy="270" rx="120" ry="90"/>
  </g>
  <g fill="${p.accent}" opacity="0.8">
    <ellipse cx="120" cy="230" rx="80"  ry="50"/>
    <ellipse cx="320" cy="200" rx="100" ry="60"/>
    <ellipse cx="520" cy="220" rx="90"  ry="50"/>
    <ellipse cx="700" cy="210" rx="80"  ry="60"/>
  </g>
`);
  },
  /** Biplane sky. */
  biplaneSky(p) {
    return wrap("0 0 800 450", `
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"   stop-color="${p.primary}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${p.paper}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <ellipse cx="180" cy="120" rx="80" ry="22" fill="${p.paper}"/>
  <ellipse cx="220" cy="100" rx="100" ry="26" fill="${p.paper}"/>
  <ellipse cx="600" cy="80" rx="90" ry="24" fill="${p.paper}"/>
  <g fill="${p.ink}">
    <rect x="380" y="220" width="160" height="14" rx="6"/>
    <rect x="430" y="194" width="60"  height="14" rx="4"/>
    <rect x="430" y="240" width="60"  height="14" rx="4"/>
    <polygon points="540,220 580,210 580,238 540,234"/>
    <circle cx="430" cy="227" r="5"/>
    <line x1="455" y1="208" x2="455" y2="246" stroke="${p.ink}" stroke-width="3"/>
  </g>
`);
  },
};

// ─── Character generators ────────────────────────────────────────────────────
// Stylised silhouettes — characters are placeholder art the scaffolder
// uses when AI portrait generation is OFF. Hybrid genres swap them at
// render time for a real portrait of the user.

const ch = {
  capePose(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="120" rx="50" ry="56" fill="${p.ink}"/>
  <path d="M 130,180 Q 200,160 270,180 L 290,400 Q 200,420 110,400 Z" fill="${p.primary}"/>
  <path d="M 150,180 Q 200,170 250,180 L 250,260 L 200,290 L 150,260 Z" fill="${p.accent}"/>
  <path d="M 130,180 L 70,280 L 90,340 L 130,260 Z" fill="${p.secondary}"/>
  <path d="M 270,180 L 330,280 L 310,340 L 270,260 Z" fill="${p.secondary}"/>
  <rect x="170" y="400" width="20" height="120" fill="${p.ink}"/>
  <rect x="210" y="400" width="20" height="120" fill="${p.ink}"/>
`);
  },
  punch(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="220" cy="120" rx="48" ry="52" fill="${p.ink}"/>
  <path d="M 150,180 L 250,180 L 280,360 L 130,360 Z" fill="${p.primary}"/>
  <circle cx="80" cy="240" r="44" fill="${p.accent}" stroke="${p.ink}" stroke-width="6"/>
  <path d="M 250,200 L 320,260 L 290,280 L 240,250 Z" fill="${p.ink}"/>
  <path d="M 130,360 L 110,520 L 150,520 L 180,380 Z" fill="${p.ink}"/>
  <path d="M 280,360 L 260,400 L 230,400 L 240,360 Z" fill="${p.ink}"/>
`);
  },
  stance(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="120" rx="46" ry="50" fill="${p.ink}"/>
  <path d="M 150,180 L 250,180 L 270,360 L 130,360 Z" fill="${p.primary}"/>
  <path d="M 160,200 L 240,200 L 230,260 L 170,260 Z" fill="${p.accent}"/>
  <rect x="130" y="180" width="40" height="120" fill="${p.ink}"/>
  <rect x="230" y="180" width="40" height="120" fill="${p.ink}"/>
  <rect x="150" y="360" width="40" height="180" fill="${p.ink}"/>
  <rect x="210" y="360" width="40" height="180" fill="${p.ink}"/>
`);
  },
  detective(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="140" rx="48" ry="50" fill="${p.ink}"/>
  <ellipse cx="200" cy="100" rx="64" ry="22" fill="${p.ink}"/>
  <rect x="160" y="92" width="80" height="20" fill="${p.ink}"/>
  <path d="M 140,200 Q 200,180 260,200 L 280,440 L 120,440 Z" fill="${p.primary}"/>
  <rect x="190" y="200" width="20" height="220" fill="${p.accent}"/>
  <rect x="155" y="440" width="30" height="120" fill="${p.ink}"/>
  <rect x="215" y="440" width="30" height="120" fill="${p.ink}"/>
`);
  },
  silhouette(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="130" rx="48" ry="50" fill="${p.ink}"/>
  <ellipse cx="200" cy="90" rx="70" ry="22" fill="${p.ink}"/>
  <rect x="160" y="84" width="80" height="22" fill="${p.ink}"/>
  <path d="M 130,190 Q 200,170 270,190 L 300,560 L 100,560 Z" fill="${p.ink}"/>
`);
  },
  operator(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="130" rx="46" ry="50" fill="${p.ink}"/>
  <rect x="160" y="118" width="80" height="24" fill="${p.primary}" opacity="0.9"/>
  <path d="M 140,200 L 260,200 L 280,400 L 120,400 Z" fill="${p.primary}"/>
  <rect x="200" y="200" width="80" height="20" fill="${p.accent}"/>
  <rect x="120" y="200" width="80" height="20" fill="${p.secondary}"/>
  <rect x="150" y="400" width="40" height="180" fill="${p.ink}"/>
  <rect x="210" y="400" width="40" height="180" fill="${p.ink}"/>
  <circle cx="180" cy="160" r="6" fill="${p.accent}"/>
`);
  },
  drone(p) {
    return wrap("0 0 400 400", `
  <ellipse cx="200" cy="200" rx="80" ry="50" fill="${p.ink}"/>
  <circle cx="200" cy="200" r="22" fill="${p.accent}"/>
  <circle cx="200" cy="200" r="10" fill="${p.paper}"/>
  <line x1="120" y1="200" x2="40"  y2="160" stroke="${p.ink}" stroke-width="6"/>
  <line x1="280" y1="200" x2="360" y2="160" stroke="${p.ink}" stroke-width="6"/>
  <circle cx="40"  cy="160" r="14" fill="${p.primary}"/>
  <circle cx="360" cy="160" r="14" fill="${p.primary}"/>
`);
  },
  heroSword(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="120" rx="46" ry="50" fill="${p.ink}"/>
  <path d="M 150,180 L 250,180 L 270,380 L 130,380 Z" fill="${p.primary}"/>
  <rect x="160" y="200" width="80" height="120" fill="${p.accent}" opacity="0.85"/>
  <rect x="295" y="120" width="14" height="280" fill="${p.ink}"/>
  <rect x="275" y="380" width="54" height="20" fill="${p.secondary}"/>
  <polygon points="302,80 318,120 286,120" fill="${p.accent}"/>
  <rect x="150" y="380" width="40" height="180" fill="${p.ink}"/>
  <rect x="210" y="380" width="40" height="180" fill="${p.ink}"/>
`);
  },
  mageStaff(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="120" rx="46" ry="50" fill="${p.ink}"/>
  <polygon points="170,80 230,80 200,40" fill="${p.primary}"/>
  <path d="M 140,180 L 260,180 L 290,460 L 110,460 Z" fill="${p.primary}"/>
  <rect x="305" y="60" width="10" height="500" fill="${p.ink}"/>
  <circle cx="310" cy="60" r="20" fill="${p.accent}"/>
  <rect x="150" y="460" width="40" height="100" fill="${p.ink}"/>
  <rect x="210" y="460" width="40" height="100" fill="${p.ink}"/>
`);
  },
  duoCoffee(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="130" cy="180" rx="44" ry="48" fill="${p.ink}"/>
  <ellipse cx="270" cy="180" rx="44" ry="48" fill="${p.ink}"/>
  <path d="M 80,240 L 180,240 L 200,420 L 60,420 Z"  fill="${p.primary}"/>
  <path d="M 220,240 L 320,240 L 340,420 L 200,420 Z" fill="${p.secondary}"/>
  <ellipse cx="200" cy="440" rx="22" ry="10" fill="${p.accent}"/>
  <rect x="190" y="430" width="20" height="20" fill="${p.accent}"/>
`);
  },
  soloBlush(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="240" rx="120" ry="140" fill="${p.ink}"/>
  <ellipse cx="200" cy="240" rx="110" ry="130" fill="${p.paper}"/>
  <circle cx="165" cy="220" r="10" fill="${p.ink}"/>
  <circle cx="235" cy="220" r="10" fill="${p.ink}"/>
  <ellipse cx="155" cy="260" rx="22" ry="10" fill="${p.secondary}" opacity="0.7"/>
  <ellipse cx="245" cy="260" rx="22" ry="10" fill="${p.secondary}" opacity="0.7"/>
  <path d="M 170,290 Q 200,310 230,290" stroke="${p.ink}" stroke-width="4" fill="none"/>
`);
  },
  personCup(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="160" rx="46" ry="50" fill="${p.ink}"/>
  <path d="M 140,220 L 260,220 L 280,420 L 120,420 Z" fill="${p.primary}"/>
  <ellipse cx="300" cy="320" rx="34" ry="22" fill="${p.accent}" stroke="${p.ink}" stroke-width="4"/>
  <path d="M 320,320 Q 340,330 320,348" stroke="${p.ink}" stroke-width="3" fill="none"/>
  <rect x="150" y="420" width="40" height="160" fill="${p.ink}"/>
  <rect x="210" y="420" width="40" height="160" fill="${p.ink}"/>
`);
  },
  personLaptop(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="140" rx="46" ry="50" fill="${p.ink}"/>
  <path d="M 140,200 L 260,200 L 280,400 L 120,400 Z" fill="${p.primary}"/>
  <rect x="100" y="360" width="200" height="120" fill="${p.ink}"/>
  <rect x="108" y="368" width="184" height="100" fill="${p.accent}"/>
  <rect x="80"  y="478" width="240" height="14" fill="${p.ink}"/>
`);
  },
  shonenPose(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="120" rx="48" ry="52" fill="${p.ink}"/>
  <path d="M 150,180 L 250,180 L 280,400 L 120,400 Z" fill="${p.primary}"/>
  <path d="M 250,200 L 340,140 L 360,160 L 270,240 Z" fill="${p.ink}"/>
  <path d="M 150,200 L 60,340 L 90,360 L 170,260 Z" fill="${p.ink}"/>
  <rect x="150" y="400" width="40" height="180" fill="${p.ink}"/>
  <rect x="210" y="400" width="40" height="180" fill="${p.ink}"/>
`);
  },
  sideEye(p) {
    return wrap("0 0 400 400", `
  <rect width="400" height="400" fill="${p.paper}"/>
  <path d="M 60,140 Q 200,80 340,140 Q 320,200 200,210 Q 80,200 60,140 Z" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>
  <ellipse cx="200" cy="160" rx="44" ry="46" fill="${p.ink}"/>
  <ellipse cx="200" cy="155" rx="18" ry="22" fill="${p.paper}"/>
  <circle cx="200" cy="160" r="8" fill="${p.ink}"/>
  <path d="M 60,200 L 100,260" stroke="${p.ink}" stroke-width="6"/>
  <path d="M 340,200 L 300,260" stroke="${p.ink}" stroke-width="6"/>
`);
  },
  robedFigure(p) {
    return wrap("0 0 400 600", `
  <path d="M 200,80 L 110,580 L 290,580 Z" fill="${p.ink}"/>
  <ellipse cx="200" cy="160" rx="44" ry="48" fill="${p.secondary}"/>
  <ellipse cx="200" cy="190" rx="64" ry="20" fill="${p.ink}" opacity="0.9"/>
`);
  },
  lanternWalker(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="140" rx="44" ry="48" fill="${p.ink}"/>
  <path d="M 150,200 L 260,200 L 290,400 L 120,400 Z" fill="${p.primary}"/>
  <rect x="295" y="200" width="6" height="200" fill="${p.ink}"/>
  <rect x="270" y="400" width="56" height="40" fill="${p.accent}" stroke="${p.ink}" stroke-width="4"/>
  <rect x="280" y="410" width="36" height="22" fill="${p.paper}"/>
  <rect x="150" y="400" width="40" height="180" fill="${p.ink}"/>
  <rect x="210" y="400" width="40" height="180" fill="${p.ink}"/>
`);
  },
  goofPose(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="140" rx="56" ry="60" fill="${p.accent}"/>
  <circle cx="180" cy="135" r="10" fill="${p.ink}"/>
  <circle cx="220" cy="135" r="10" fill="${p.ink}"/>
  <path d="M 170,170 Q 200,200 230,170" stroke="${p.ink}" stroke-width="6" fill="none"/>
  <path d="M 130,210 L 270,210 L 300,440 L 100,440 Z" fill="${p.primary}"/>
  <rect x="140" y="440" width="50" height="140" fill="${p.ink}" transform="rotate(-12 165 510)"/>
  <rect x="210" y="440" width="50" height="140" fill="${p.ink}" transform="rotate(15 235 510)"/>
`);
  },
  thumbsUp(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="140" rx="52" ry="56" fill="${p.accent}"/>
  <circle cx="180" cy="135" r="8" fill="${p.ink}"/>
  <circle cx="220" cy="135" r="8" fill="${p.ink}"/>
  <path d="M 170,160 Q 200,180 230,160" stroke="${p.ink}" stroke-width="4" fill="none"/>
  <path d="M 140,210 L 260,210 L 280,400 L 120,400 Z" fill="${p.primary}"/>
  <circle cx="100" cy="220" r="34" fill="${p.accent}" stroke="${p.ink}" stroke-width="6"/>
  <rect x="80" y="180" width="20" height="60" fill="${p.accent}" stroke="${p.ink}" stroke-width="6"/>
`);
  },
  driver(p) {
    return wrap("0 0 400 600", `
  <path d="M 60,460 L 340,460 L 320,580 L 80,580 Z" fill="${p.primary}"/>
  <path d="M 80,460 L 320,460 L 300,360 L 100,360 Z" fill="${p.secondary}"/>
  <rect x="120" y="380" width="160" height="60" fill="${p.accent}" opacity="0.8"/>
  <circle cx="100" cy="540" r="30" fill="${p.ink}"/>
  <circle cx="300" cy="540" r="30" fill="${p.ink}"/>
  <ellipse cx="200" cy="380" rx="32" ry="34" fill="${p.ink}"/>
  <rect x="170" y="370" width="60" height="18" fill="${p.paper}"/>
`);
  },
  neonFigure(p) {
    return wrap("0 0 400 600", `
  <g stroke="${p.primary}" stroke-width="6" fill="none" opacity="0.95">
    <circle cx="200" cy="120" r="44"/>
    <line x1="200" y1="164" x2="200" y2="360"/>
    <line x1="200" y1="200" x2="120" y2="280"/>
    <line x1="200" y1="200" x2="280" y2="280"/>
    <line x1="200" y1="360" x2="150" y2="560"/>
    <line x1="200" y1="360" x2="250" y2="560"/>
  </g>
  <g stroke="${p.accent}" stroke-width="2" fill="none" opacity="0.65">
    <circle cx="200" cy="120" r="44"/>
    <line x1="200" y1="164" x2="200" y2="360"/>
    <line x1="200" y1="200" x2="120" y2="280"/>
    <line x1="200" y1="200" x2="280" y2="280"/>
    <line x1="200" y1="360" x2="150" y2="560"/>
    <line x1="200" y1="360" x2="250" y2="560"/>
  </g>
`);
  },
  talkingHead(p) {
    return wrap("0 0 400 600", `
  <rect width="400" height="600" fill="${p.paper}"/>
  <ellipse cx="200" cy="220" rx="120" ry="140" fill="${p.primary}" opacity="0.85"/>
  <ellipse cx="200" cy="200" rx="100" ry="120" fill="${p.paper}"/>
  <circle cx="170" cy="195" r="8" fill="${p.ink}"/>
  <circle cx="230" cy="195" r="8" fill="${p.ink}"/>
  <path d="M 170,240 Q 200,260 230,240" stroke="${p.ink}" stroke-width="4" fill="none"/>
  <path d="M 80,380 Q 200,340 320,380 L 320,600 L 80,600 Z" fill="${p.primary}"/>
`);
  },
  twoShot(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="130" cy="220" rx="80" ry="90" fill="${p.primary}" opacity="0.85"/>
  <ellipse cx="130" cy="210" rx="68" ry="78" fill="${p.paper}"/>
  <ellipse cx="270" cy="220" rx="80" ry="90" fill="${p.secondary}" opacity="0.85"/>
  <ellipse cx="270" cy="210" rx="68" ry="78" fill="${p.paper}"/>
  <path d="M 30,360 Q 130,320 230,360 Q 330,320 380,360 L 380,600 L 30,600 Z" fill="${p.primary}" opacity="0.8"/>
`);
  },
  explorer(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="200" cy="140" rx="46" ry="50" fill="${p.ink}"/>
  <ellipse cx="200" cy="106" rx="70" ry="22" fill="${p.ink}"/>
  <rect x="160" y="98" width="80" height="22" fill="${p.ink}"/>
  <path d="M 130,200 Q 200,180 270,200 L 290,420 L 110,420 Z" fill="${p.accent}"/>
  <rect x="190" y="220" width="20" height="200" fill="${p.secondary}"/>
  <rect x="150" y="420" width="40" height="160" fill="${p.ink}"/>
  <rect x="210" y="420" width="40" height="160" fill="${p.ink}"/>
`);
  },
  running(p) {
    return wrap("0 0 400 600", `
  <ellipse cx="220" cy="120" rx="44" ry="48" fill="${p.ink}"/>
  <path d="M 150,180 L 280,180 L 310,360 L 130,360 Z" fill="${p.primary}"/>
  <path d="M 130,360 L 80,520 L 110,540 L 180,380 Z" fill="${p.ink}"/>
  <path d="M 280,360 L 340,500 L 310,520 L 250,380 Z" fill="${p.ink}"/>
  <path d="M 150,200 L 70,280 L 90,300 L 170,240 Z" fill="${p.ink}"/>
  <path d="M 280,200 L 360,260 L 340,280 L 260,240 Z" fill="${p.ink}"/>
`);
  },
};

// ─── Prop generators ────────────────────────────────────────────────────────

const prop = {
  motionLines(p) {
    const lines = [];
    for (let i = 0; i < 24; i++) {
      const y = 4 + i * 8;
      const x = i % 2 === 0 ? 0 : 30;
      lines.push(`<line x1="${x}" y1="${y}" x2="${x + 160}" y2="${y}" stroke="${p.ink}" stroke-width="3"/>`);
    }
    return wrap("0 0 200 200", `${lines.join("\n  ")}`);
  },
  explosion(p) {
    return wrap("0 0 200 200", `
  <polygon points="100,4 116,60 172,40 138,90 196,108 138,118 168,170 110,138 100,196 90,138 32,170 62,118 4,108 62,90 28,40 84,60" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
  <polygon points="100,40 110,80 144,72 122,100 150,116 116,118 130,150 100,130 90,160 84,130 60,150 78,116 50,108 80,98 56,72 90,82" fill="${p.secondary}"/>
`);
  },
  cigarette(p) {
    return wrap("0 0 200 200", `
  <path d="M 60,20 Q 80,40 70,80 Q 50,120 70,160" stroke="${p.ink}" stroke-width="4" fill="none" opacity="0.6"/>
  <path d="M 100,40 Q 130,80 110,140 Q 80,180 110,200" stroke="${p.ink}" stroke-width="4" fill="none" opacity="0.6"/>
  <rect x="80" y="160" width="80" height="14" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/>
  <rect x="148" y="160" width="14" height="14" fill="${p.accent}"/>
`);
  },
  evidence(p) {
    return wrap("0 0 200 200", `
  <rect x="20" y="30" width="160" height="140" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>
  <rect x="40" y="20" width="120" height="20" fill="${p.accent}" stroke="${p.ink}" stroke-width="4"/>
  <line x1="40"  y1="70"  x2="160" y2="70"  stroke="${p.ink}" stroke-width="3"/>
  <line x1="40"  y1="90"  x2="160" y2="90"  stroke="${p.ink}" stroke-width="3"/>
  <line x1="40"  y1="110" x2="120" y2="110" stroke="${p.ink}" stroke-width="3"/>
  <line x1="40"  y1="130" x2="140" y2="130" stroke="${p.ink}" stroke-width="3"/>
`);
  },
  hud(p) {
    return wrap("0 0 200 200", `
  <g stroke="${p.primary}" stroke-width="3" fill="none" opacity="0.9">
    <circle cx="100" cy="100" r="80"/>
    <circle cx="100" cy="100" r="60"/>
    <line x1="20" y1="100" x2="40" y2="100"/>
    <line x1="160" y1="100" x2="180" y2="100"/>
    <line x1="100" y1="20" x2="100" y2="40"/>
    <line x1="100" y1="160" x2="100" y2="180"/>
  </g>
  <circle cx="100" cy="100" r="6" fill="${p.accent}"/>
`);
  },
  dataStream(p) {
    const bits = [];
    for (let i = 0; i < 40; i++) {
      const x = (i % 8) * 25 + 4;
      const y = Math.floor(i / 8) * 40 + 8;
      bits.push(`<text x="${x}" y="${y + 14}" font-family="monospace" font-size="14" fill="${p.primary}">${i % 2 === 0 ? "01" : "10"}</text>`);
    }
    return wrap("0 0 200 200", `${bits.join("\n  ")}`);
  },
  scroll(p) {
    return wrap("0 0 200 200", `
  <rect x="30" y="20" width="140" height="160" fill="${p.paper}" stroke="${p.ink}" stroke-width="5"/>
  <ellipse cx="30" cy="100" rx="14" ry="80" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
  <ellipse cx="170" cy="100" rx="14" ry="80" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
  <line x1="50" y1="60" x2="150" y2="60" stroke="${p.ink}" stroke-width="3"/>
  <line x1="50" y1="80" x2="150" y2="80" stroke="${p.ink}" stroke-width="3"/>
  <line x1="50" y1="100" x2="130" y2="100" stroke="${p.ink}" stroke-width="3"/>
  <line x1="50" y1="120" x2="140" y2="120" stroke="${p.ink}" stroke-width="3"/>
`);
  },
  lantern(p) {
    return wrap("0 0 200 200", `
  <rect x="80" y="40" width="40" height="12" fill="${p.ink}"/>
  <line x1="100" y1="40" x2="100" y2="20" stroke="${p.ink}" stroke-width="4"/>
  <path d="M 100,4 L 110,18 L 90,18 Z" fill="${p.ink}"/>
  <rect x="64" y="60" width="72" height="100" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
  <line x1="64" y1="100" x2="136" y2="100" stroke="${p.ink}" stroke-width="3"/>
  <rect x="76" y="160" width="48" height="12" fill="${p.ink}"/>
`);
  },
  hearts(p) {
    return wrap("0 0 200 200", `
  <g fill="${p.secondary}">
    <path d="M 50,80 Q 50,60 70,60 Q 90,60 90,80 Q 90,100 70,120 Q 50,100 50,80 Z" transform="rotate(-12 70 90)"/>
    <path d="M 110,40 Q 110,20 130,20 Q 150,20 150,40 Q 150,60 130,80 Q 110,60 110,40 Z"/>
    <path d="M 60,150 Q 60,130 80,130 Q 100,130 100,150 Q 100,170 80,190 Q 60,170 60,150 Z"/>
    <path d="M 130,140 Q 130,120 150,120 Q 170,120 170,140 Q 170,160 150,180 Q 130,160 130,140 Z" transform="rotate(20 150 150)"/>
  </g>
`);
  },
  sparkles(p) {
    return wrap("0 0 200 200", `
  <g fill="${p.accent}">
    <path d="M 50,30 L 56,50 L 76,56 L 56,62 L 50,82 L 44,62 L 24,56 L 44,50 Z"/>
    <path d="M 140,90 L 148,110 L 168,118 L 148,126 L 140,146 L 132,126 L 112,118 L 132,110 Z"/>
    <path d="M 90,140 L 94,156 L 110,160 L 94,164 L 90,180 L 86,164 L 70,160 L 86,156 Z"/>
  </g>
`);
  },
  houseplant(p) {
    return wrap("0 0 200 200", `
  <path d="M 100,80 Q 60,80 60,140 L 140,140 Q 140,80 100,80 Z" fill="${p.primary}" stroke="${p.ink}" stroke-width="4"/>
  <path d="M 100,80 Q 60,40 90,20" stroke="${p.primary}" stroke-width="6" fill="none"/>
  <path d="M 100,80 Q 140,40 110,20" stroke="${p.primary}" stroke-width="6" fill="none"/>
  <path d="M 100,80 Q 80,30 100,10" stroke="${p.primary}" stroke-width="6" fill="none"/>
  <rect x="55" y="140" width="90" height="40" fill="${p.secondary}" stroke="${p.ink}" stroke-width="4"/>
`);
  },
  notebook(p) {
    return wrap("0 0 200 200", `
  <rect x="40" y="30" width="120" height="140" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/>
  <rect x="40" y="30" width="120" height="20" fill="${p.primary}"/>
  <g stroke="${p.ink}" stroke-width="2">
    <line x1="50" y1="80" x2="150" y2="80"/>
    <line x1="50" y1="100" x2="150" y2="100"/>
    <line x1="50" y1="120" x2="150" y2="120"/>
    <line x1="50" y1="140" x2="120" y2="140"/>
  </g>
  <circle cx="100" cy="40" r="4" fill="${p.paper}"/>
`);
  },
  energyAura(p) {
    return wrap("0 0 200 200", `
  <g stroke="${p.primary}" stroke-width="4" fill="none" opacity="0.85">
    <circle cx="100" cy="100" r="40"/>
    <circle cx="100" cy="100" r="60"/>
    <circle cx="100" cy="100" r="80"/>
  </g>
  <g stroke="${p.accent}" stroke-width="2" fill="none" opacity="0.6">
    <circle cx="100" cy="100" r="50"/>
    <circle cx="100" cy="100" r="70"/>
  </g>
`);
  },
  sweatDrop(p) {
    return wrap("0 0 200 200", `
  <path d="M 100,40 Q 130,90 130,130 Q 130,170 100,170 Q 70,170 70,130 Q 70,90 100,40 Z" fill="${p.primary}" stroke="${p.ink}" stroke-width="5"/>
  <ellipse cx="92" cy="120" rx="10" ry="20" fill="${p.paper}" opacity="0.7"/>
`);
  },
  raven(p) {
    return wrap("0 0 200 200", `
  <ellipse cx="100" cy="120" rx="60" ry="30" fill="${p.ink}"/>
  <ellipse cx="130" cy="100" rx="30" ry="26" fill="${p.ink}"/>
  <circle cx="138" cy="96" r="4" fill="${p.accent}"/>
  <polygon points="150,100 174,96 158,108" fill="${p.accent}"/>
  <path d="M 60,110 L 40,150 L 70,140 Z" fill="${p.ink}"/>
  <path d="M 100,140 L 90,170 L 110,160 Z" fill="${p.ink}"/>
`);
  },
  tendril(p) {
    return wrap("0 0 200 200", `
  <path d="M 30,180 Q 50,80 100,120 Q 150,160 170,40" stroke="${p.secondary}" stroke-width="8" fill="none"/>
  <path d="M 60,160 Q 80,140 80,100" stroke="${p.secondary}" stroke-width="6" fill="none"/>
  <path d="M 130,80 Q 140,60 130,30" stroke="${p.secondary}" stroke-width="6" fill="none"/>
`);
  },
  bananaPeel(p) {
    return wrap("0 0 200 200", `
  <path d="M 30,140 Q 20,100 50,80 Q 80,60 110,80 Q 140,100 150,150 Q 100,160 60,150 Z" fill="${p.accent}" stroke="${p.ink}" stroke-width="4"/>
  <path d="M 70,140 Q 80,100 110,90" stroke="${p.ink}" stroke-width="2" fill="none"/>
`);
  },
  confetti(p) {
    return wrap("0 0 200 200", `
  <g>
    <rect x="20"  y="40"  width="16" height="6" fill="${p.primary}"   transform="rotate(20 28 43)"/>
    <rect x="60"  y="80"  width="16" height="6" fill="${p.secondary}" transform="rotate(45 68 83)"/>
    <rect x="120" y="50"  width="16" height="6" fill="${p.accent}"    transform="rotate(-30 128 53)"/>
    <rect x="160" y="100" width="16" height="6" fill="${p.primary}"   transform="rotate(15 168 103)"/>
    <rect x="40"  y="140" width="16" height="6" fill="${p.secondary}" transform="rotate(-15 48 143)"/>
    <rect x="110" y="160" width="16" height="6" fill="${p.accent}"    transform="rotate(30 118 163)"/>
  </g>
`);
  },
  boombox(p) {
    return wrap("0 0 200 200", `
  <rect x="20" y="60" width="160" height="100" rx="8" fill="${p.ink}"/>
  <circle cx="60"  cy="110" r="28" fill="${p.accent}" stroke="${p.paper}" stroke-width="4"/>
  <circle cx="140" cy="110" r="28" fill="${p.accent}" stroke="${p.paper}" stroke-width="4"/>
  <rect x="86" y="80"  width="28" height="20" fill="${p.primary}"/>
  <rect x="86" y="120" width="28" height="20" fill="${p.primary}"/>
  <rect x="50" y="50"  width="100" height="10" fill="${p.ink}"/>
`);
  },
  cassette(p) {
    return wrap("0 0 200 200", `
  <rect x="20" y="60" width="160" height="100" rx="4" fill="${p.primary}" stroke="${p.ink}" stroke-width="4"/>
  <rect x="35" y="80" width="130" height="40" fill="${p.paper}"/>
  <circle cx="70"  cy="100" r="14" fill="${p.ink}"/>
  <circle cx="130" cy="100" r="14" fill="${p.ink}"/>
  <rect x="40" y="130" width="120" height="20" fill="${p.accent}"/>
`);
  },
  phone(p) {
    return wrap("0 0 200 200", `
  <rect x="60" y="20" width="80" height="160" rx="12" fill="${p.ink}"/>
  <rect x="68" y="40" width="64" height="120" fill="${p.primary}" opacity="0.7"/>
  <circle cx="100" cy="170" r="6" fill="${p.paper}"/>
`);
  },
  thoughtCloud(p) {
    return wrap("0 0 200 200", `
  <path d="M 40,80 Q 30,50 60,50 Q 70,30 100,30 Q 130,30 140,50 Q 170,50 160,80 Q 180,90 170,110 Q 170,130 150,130 Q 140,150 110,140 Q 90,160 70,140 Q 40,140 40,120 Q 20,110 40,80 Z" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/>
  <circle cx="80"  cy="160" r="6" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/>
  <circle cx="65"  cy="180" r="4" fill="${p.paper}" stroke="${p.ink}" stroke-width="2"/>
`);
  },
  compass(p) {
    return wrap("0 0 200 200", `
  <circle cx="100" cy="100" r="80" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>
  <circle cx="100" cy="100" r="60" fill="none" stroke="${p.ink}" stroke-width="3"/>
  <polygon points="100,30 110,100 100,90 90,100" fill="${p.secondary}"/>
  <polygon points="100,170 110,100 100,110 90,100" fill="${p.primary}"/>
  <text x="92"  y="30"  font-family="serif" font-size="20" fill="${p.ink}">N</text>
  <text x="92"  y="190" font-family="serif" font-size="20" fill="${p.ink}">S</text>
`);
  },
  satchel(p) {
    return wrap("0 0 200 200", `
  <path d="M 40,80 L 160,80 L 170,170 L 30,170 Z" fill="${p.primary}" stroke="${p.ink}" stroke-width="4"/>
  <path d="M 60,80 Q 60,40 100,40 Q 140,40 140,80" stroke="${p.ink}" stroke-width="4" fill="none"/>
  <rect x="80" y="110" width="40" height="30" fill="${p.accent}" stroke="${p.ink}" stroke-width="3"/>
`);
  },
};

// ─── SFX generators ─────────────────────────────────────────────────────────

const sfx = {
  starBurst(p) {
    return wrap("0 0 200 200", `
  <polygon points="100,8 116,68 180,68 130,108 150,180 100,140 50,180 70,108 20,68 84,68" fill="${p.accent}" stroke="${p.ink}" stroke-width="6"/>
`);
  },
  jaggedBurst(p) {
    return wrap("0 0 200 200", `
  <polygon points="100,8 118,40 158,28 144,68 184,72 154,98 188,128 148,134 168,176 128,160 124,196 100,168 76,196 72,160 32,176 52,134 12,128 46,98 16,72 56,68 42,28 82,40" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
`);
  },
  typewriterCaption(p) {
    return wrap("0 0 240 80", `
  <rect width="240" height="80" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/>
  <text x="20" y="50" font-family="monospace" font-size="28" fill="${p.ink}">CLICK . CLACK</text>
`);
  },
  pulseRing(p) {
    return wrap("0 0 200 200", `
  <g stroke="${p.primary}" stroke-width="6" fill="none">
    <circle cx="100" cy="100" r="40"/>
    <circle cx="100" cy="100" r="60" opacity="0.7"/>
    <circle cx="100" cy="100" r="80" opacity="0.4"/>
  </g>
`);
  },
  rune(p) {
    return wrap("0 0 200 200", `
  <circle cx="100" cy="100" r="60" fill="${p.accent}" stroke="${p.ink}" stroke-width="5" opacity="0.8"/>
  <path d="M 80,60 L 100,140 L 120,60 M 70,100 L 130,100" stroke="${p.ink}" stroke-width="5" fill="none"/>
`);
  },
  heartBurst(p) {
    return wrap("0 0 200 200", `
  <path d="M 100,40 Q 60,10 60,60 Q 60,100 100,140 Q 140,100 140,60 Q 140,10 100,40" fill="${p.secondary}" stroke="${p.ink}" stroke-width="5"/>
  <g stroke="${p.accent}" stroke-width="3">
    <line x1="100" y1="160" x2="100" y2="180"/>
    <line x1="60"  y1="150" x2="50"  y2="170"/>
    <line x1="140" y1="150" x2="150" y2="170"/>
  </g>
`);
  },
  impactStar(p) {
    return wrap("0 0 200 200", `
  <polygon points="100,4 130,70 196,80 144,124 156,194 100,154 44,194 56,124 4,80 70,70" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>
  <polygon points="100,30 122,70 168,80 132,110 142,156 100,128 58,156 68,110 32,80 78,70" fill="${p.accent}"/>
`);
  },
  drip(p) {
    return wrap("0 0 200 200", `
  <path d="M 100,20 Q 130,80 130,120 Q 130,160 100,160 Q 70,160 70,120 Q 70,80 100,20 Z" fill="${p.primary}" stroke="${p.ink}" stroke-width="4"/>
  <ellipse cx="100" cy="180" rx="60" ry="14" fill="${p.primary}" opacity="0.45"/>
`);
  },
  bouncyBurst(p) {
    return wrap("0 0 200 200", `
  <polygon points="100,8 122,42 168,28 152,72 196,82 156,108 180,150 134,144 136,196 100,168 64,196 66,144 20,150 44,108 4,82 48,72 32,28 78,42" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
`);
  },
  laser(p) {
    return wrap("0 0 200 200", `
  <polygon points="100,4 130,80 200,100 130,120 100,196 70,120 0,100 70,80" fill="${p.primary}" stroke="${p.ink}" stroke-width="4"/>
  <circle cx="100" cy="100" r="10" fill="${p.accent}"/>
`);
  },
  dustBurst(p) {
    return wrap("0 0 200 200", `
  <g fill="${p.accent}" opacity="0.85">
    <ellipse cx="60"  cy="120" rx="36" ry="20"/>
    <ellipse cx="110" cy="100" rx="50" ry="28"/>
    <ellipse cx="160" cy="130" rx="32" ry="18"/>
    <ellipse cx="100" cy="160" rx="60" ry="14"/>
  </g>
`);
  },
};

// ─── Asset manifest — what each genre actually ships ─────────────────────────
// Mirrors the `stockAssets` block in `shared/comic-genres.ts`. Adding a
// new genre means adding (1) a palette block above and (2) one entry
// here mapping each declared asset id to a generator function.

const MANIFEST = {
  hero: {
    backgrounds: { "skyline-dawn": bg.skyline,   "burst-radial": bg.burst,    "halftone": bg.halftone },
    characters:  { "hero-cape-pose": ch.capePose, "hero-punch": ch.punch,     "hero-stance": ch.stance },
    props:       { "motion-lines": prop.motionLines, "explosion": prop.explosion },
    sfx:         { "sfx-star": sfx.starBurst, "sfx-jagged": sfx.jaggedBurst },
  },
  noir: {
    backgrounds: { "rain-street": bg.rainStreet, "venetian-light": bg.venetian, "smoke": bg.smoke },
    characters:  { "detective-coat": ch.detective, "silhouette-hat": ch.silhouette },
    props:       { "cigarette": prop.cigarette, "evidence": prop.evidence },
    sfx:         { "sfx-typewriter": sfx.typewriterCaption },
  },
  scifi: {
    backgrounds: { "neon-city": bg.neonCity, "circuit": bg.circuit, "hologram-grid": bg.hologram },
    characters:  { "operator-rig": ch.operator, "drone": ch.drone },
    props:       { "hud": prop.hud, "data-stream": prop.dataStream },
    sfx:         { "sfx-pulse": sfx.pulseRing },
  },
  fantasy: {
    backgrounds: { "mountain-pass": bg.mountain, "parchment": bg.parchment, "castle": bg.castle },
    characters:  { "hero-sword": ch.heroSword, "mage-staff": ch.mageStaff },
    props:       { "scroll": prop.scroll, "lantern": prop.lantern },
    sfx:         { "sfx-rune": sfx.rune },
  },
  romance: {
    backgrounds: { "petals": bg.petals, "cafe": bg.cafe, "sunset": bg.sunset },
    characters:  { "duo-coffee": ch.duoCoffee, "solo-blush": ch.soloBlush },
    props:       { "hearts": prop.hearts, "sparkles": prop.sparkles },
    sfx:         { "sfx-heart-burst": sfx.heartBurst },
  },
  slice: {
    backgrounds: { "kitchen-window": bg.kitchenWindow, "park-bench": bg.parkBench, "morning-desk": bg.morningDesk },
    characters:  { "person-cup": ch.personCup, "person-laptop": ch.personLaptop },
    props:       { "houseplant": prop.houseplant, "notebook": prop.notebook },
    sfx:         {},
  },
  manga: {
    backgrounds: { "speed-lines": bg.speedLines, "screentone": bg.screentone, "training-dojo": bg.dojo },
    characters:  { "shonen-pose": ch.shonenPose, "side-eye": ch.sideEye },
    props:       { "energy-aura": prop.energyAura, "sweat-drop": prop.sweatDrop },
    sfx:         { "sfx-impact-star": sfx.impactStar },
  },
  horror: {
    backgrounds: { "old-house": bg.oldHouse, "fog": bg.fog, "candlelight": bg.candle },
    characters:  { "robed-figure": ch.robedFigure, "lantern-walker": ch.lanternWalker },
    props:       { "raven": prop.raven, "tendril": prop.tendril },
    sfx:         { "sfx-drip": sfx.drip },
  },
  comedy: {
    backgrounds: { "polka-dots": bg.polka, "stripes": bg.stripes, "office": bg.cartoonOffice },
    characters:  { "goof-pose": ch.goofPose, "thumbs-up": ch.thumbsUp },
    props:       { "banana-peel": prop.bananaPeel, "confetti": prop.confetti },
    sfx:         { "sfx-bounce": sfx.bouncyBurst },
  },
  retro80s: {
    backgrounds: { "grid-sunset": bg.gridSunset, "palms": bg.palms, "scanlines": bg.scanlines },
    characters:  { "driver": ch.driver, "neon-figure": ch.neonFigure },
    props:       { "boombox": prop.boombox, "cassette": prop.cassette },
    sfx:         { "sfx-laser": sfx.laser },
  },
  webtoon: {
    backgrounds: { "gradient-soft": bg.gradient, "indoor-soft": bg.indoorSoft, "outdoor-pastel": bg.outdoorPastel },
    characters:  { "talking-head": ch.talkingHead, "two-shot": ch.twoShot },
    props:       { "phone": prop.phone, "thought-cloud": prop.thoughtCloud },
    sfx:         {},
  },
  adventure: {
    backgrounds: { "map-overlay": bg.mapOverlay, "jungle": bg.jungle, "biplane-sky": bg.biplaneSky },
    characters:  { "explorer-hat": ch.explorer, "running": ch.running },
    props:       { "compass": prop.compass, "satchel": prop.satchel },
    sfx:         { "sfx-dust": sfx.dustBurst },
  },
};

// ─── Path resolution ────────────────────────────────────────────────────────
// File names follow the `comic-genres.ts` `stockAssets` declarations.

const PATH_BY_CATEGORY = {
  backgrounds: (id) => `bg-${id.replace(/^bg-?/, "")}.svg`,
  characters:  (id) => `char-${id.replace(/^char-?/, "").replace(/^hero-/, "")}.svg`,
  props:       (id) => `prop-${id.replace(/^prop-?/, "")}.svg`,
  sfx:         (id) => `${id}.svg`,
};

// File names mapped EXACTLY to the catalog so the generator emits the
// paths the manifest declares. Matches the `path` field in
// `comic-genres.ts` so the runtime `img.src` resolves.

const FILE_NAME_BY_GENRE_AND_ID = {
  hero: {
    "skyline-dawn": "bg-skyline.svg",
    "burst-radial": "bg-burst.svg",
    "halftone":     "bg-halftone.svg",
    "hero-cape-pose": "char-cape.svg",
    "hero-punch":     "char-punch.svg",
    "hero-stance":    "char-stance.svg",
    "motion-lines":   "prop-motion-lines.svg",
    "explosion":      "prop-explosion.svg",
    "sfx-star":       "sfx-star.svg",
    "sfx-jagged":     "sfx-jagged.svg",
  },
  noir: {
    "rain-street":     "bg-rain-street.svg",
    "venetian-light":  "bg-venetian.svg",
    "smoke":           "bg-smoke.svg",
    "detective-coat":  "char-detective.svg",
    "silhouette-hat":  "char-silhouette.svg",
    "cigarette":       "prop-cigarette.svg",
    "evidence":        "prop-evidence.svg",
    "sfx-typewriter":  "sfx-typewriter.svg",
  },
  scifi: {
    "neon-city":      "bg-neon-city.svg",
    "circuit":        "bg-circuit.svg",
    "hologram-grid":  "bg-hologram.svg",
    "operator-rig":   "char-operator.svg",
    "drone":          "char-drone.svg",
    "hud":            "prop-hud.svg",
    "data-stream":    "prop-data.svg",
    "sfx-pulse":      "sfx-pulse.svg",
  },
  fantasy: {
    "mountain-pass": "bg-mountain.svg",
    "parchment":     "bg-parchment.svg",
    "castle":        "bg-castle.svg",
    "hero-sword":    "char-sword.svg",
    "mage-staff":    "char-mage.svg",
    "scroll":        "prop-scroll.svg",
    "lantern":       "prop-lantern.svg",
    "sfx-rune":      "sfx-rune.svg",
  },
  romance: {
    "petals":          "bg-petals.svg",
    "cafe":            "bg-cafe.svg",
    "sunset":          "bg-sunset.svg",
    "duo-coffee":      "char-duo.svg",
    "solo-blush":      "char-blush.svg",
    "hearts":          "prop-hearts.svg",
    "sparkles":        "prop-sparkles.svg",
    "sfx-heart-burst": "sfx-heart-burst.svg",
  },
  slice: {
    "kitchen-window": "bg-kitchen.svg",
    "park-bench":     "bg-park.svg",
    "morning-desk":   "bg-desk.svg",
    "person-cup":     "char-cup.svg",
    "person-laptop":  "char-laptop.svg",
    "houseplant":     "prop-plant.svg",
    "notebook":       "prop-notebook.svg",
  },
  manga: {
    "speed-lines":      "bg-speed.svg",
    "screentone":       "bg-screentone.svg",
    "training-dojo":    "bg-dojo.svg",
    "shonen-pose":      "char-shonen.svg",
    "side-eye":         "char-eyes.svg",
    "energy-aura":      "prop-aura.svg",
    "sweat-drop":       "prop-sweat.svg",
    "sfx-impact-star":  "sfx-impact.svg",
  },
  horror: {
    "old-house":      "bg-house.svg",
    "fog":            "bg-fog.svg",
    "candlelight":    "bg-candle.svg",
    "robed-figure":   "char-robed.svg",
    "lantern-walker": "char-lantern.svg",
    "raven":          "prop-raven.svg",
    "tendril":        "prop-tendril.svg",
    "sfx-drip":       "sfx-drip.svg",
  },
  comedy: {
    "polka-dots":  "bg-polka.svg",
    "stripes":     "bg-stripes.svg",
    "office":      "bg-office.svg",
    "goof-pose":   "char-goof.svg",
    "thumbs-up":   "char-thumbs.svg",
    "banana-peel": "prop-banana.svg",
    "confetti":    "prop-confetti.svg",
    "sfx-bounce":  "sfx-bounce.svg",
  },
  retro80s: {
    "grid-sunset": "bg-grid-sunset.svg",
    "palms":       "bg-palms.svg",
    "scanlines":   "bg-scanlines.svg",
    "driver":      "char-driver.svg",
    "neon-figure": "char-neon.svg",
    "boombox":     "prop-boombox.svg",
    "cassette":    "prop-cassette.svg",
    "sfx-laser":   "sfx-laser.svg",
  },
  webtoon: {
    "gradient-soft":  "bg-gradient.svg",
    "indoor-soft":    "bg-indoor.svg",
    "outdoor-pastel": "bg-outdoor.svg",
    "talking-head":   "char-head.svg",
    "two-shot":       "char-two.svg",
    "phone":          "prop-phone.svg",
    "thought-cloud":  "prop-thought.svg",
  },
  adventure: {
    "map-overlay":  "bg-map.svg",
    "jungle":       "bg-jungle.svg",
    "biplane-sky":  "bg-biplane.svg",
    "explorer-hat": "char-explorer.svg",
    "running":      "char-running.svg",
    "compass":      "prop-compass.svg",
    "satchel":      "prop-satchel.svg",
    "sfx-dust":     "sfx-dust.svg",
  },
};

// ─── Generation pass ────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

let written = 0;
for (const [genre, categories] of Object.entries(MANIFEST)) {
  const palette = PALETTES[genre];
  const fileMap = FILE_NAME_BY_GENRE_AND_ID[genre] ?? {};
  const dir = path.join(OUT_ROOT, genre);
  ensureDir(dir);
  for (const [category, assets] of Object.entries(categories)) {
    for (const [assetId, generator] of Object.entries(assets)) {
      const fileName = fileMap[assetId];
      if (!fileName) {
        console.warn(`[skip] ${genre}/${assetId}: no file mapping`);
        continue;
      }
      const svg = generator(palette);
      const fullPath = path.join(dir, fileName);
      fs.writeFileSync(fullPath, svg, "utf8");
      written += 1;
    }
  }
}

console.log(`Wrote ${written} SVGs under ${OUT_ROOT}`);
