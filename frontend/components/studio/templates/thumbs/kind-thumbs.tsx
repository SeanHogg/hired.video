// Derived-kind thumbnails (animation / CAD / comic) — each driven by its
// preset SSoT, so new templates of these kinds need no changes here.

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { COMIC_GENRES } from "@shared/comic-genres";

/**
 * Animation-template thumbnail — frame-strip mini-preview. All 4
 * animation templates share this component (DRY); the preset's
 * `starterFrames` count drives the strip length + `fps` drives the
 * label so each template's card visually previews the strip you'll
 * land in the editor with. Per-template accent reads from the id
 * suffix so each card stays visually distinct (logo loop = brand
 * purple, spinner = mono, reaction = warm, explainer = teal).
 */
export function AnimationThumb({
  id,
  preset,
}: {
  id: string;
  preset: { width: number; height: number; fps: number; starterFrames: number };
}) {
  const { t } = useTranslation();
  // Per-id accent. Reads off the trailing slug so the four templates
  // are visually distinct without proliferating switch cases.
  const accent =
    id === "animation-logo-loop"
      ? { bg: "from-sky-600 to-teal-700", chip: "bg-sky-300 text-sky-950" }
      : id === "animation-spinner"
      ? { bg: "from-slate-700 to-slate-900", chip: "bg-slate-300 text-slate-950" }
      : id === "animation-reaction"
      ? { bg: "from-amber-500 to-rose-600", chip: "bg-amber-200 text-amber-950" }
      : { bg: "from-teal-700 to-cyan-800", chip: "bg-teal-200 text-teal-950" };
  // Cap the visible frame count at 6 — the strip reads as "multi-
  // frame" regardless of seed count, and at thumbnail size more cells
  // become illegible. Real strip length surfaces in the chip below.
  const visibleFrames = Math.min(6, preset.starterFrames);
  return (
    <div className={cn("absolute inset-0 flex flex-col bg-gradient-to-br p-2 text-white", accent.bg)}>
      <div className="text-[6px] tracking-widest opacity-80 truncate">{t("studio.templateThumb.animation")}</div>
      <div className="mt-0.5 text-[8px] font-bold leading-tight">
        {preset.width}×{preset.height}
      </div>
      <div className="mt-auto flex gap-[2px]">
        {Array.from({ length: visibleFrames }).map((_, i) => (
          <div
            key={i}
            className="aspect-square flex-1 rounded-[2px] border border-white/30 bg-white/10"
          >
            {/* Stick-figure-ish dot to telegraph per-frame variation. */}
            <div
              className="m-auto mt-[35%] h-1 w-1 rounded-full bg-white/80"
              style={{ marginLeft: `${20 + i * 8}%` }}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-1 right-1 flex gap-1">
        <span className={cn("rounded-full px-1.5 py-0.5 text-[7px] font-bold", accent.chip)}>
          {preset.starterFrames}f · {preset.fps}fps
        </span>
      </div>
    </div>
  );
}

/**
 * CAD-template thumbnail — drafting-paper-shaped card with a grid
 * overlay + scale + dimension chip. All 4 CAD templates share this
 * component (DRY); the per-template accent + label come from the
 * preset (sheet dimensions in mm, grid spacing, unit). The visual
 * reads as "engineering drawing" at a glance — distinct from the
 * raster-paint look of `<AnimationThumb>` / `<DrawingPlaceholderThumbnail>`.
 */
export function CadThumb({
  id,
  preset,
}: {
  id: string;
  preset: { widthMm: number; heightMm: number; unit: string; grid: { visibleSpacingMm: number } };
}) {
  // Per-id accent matches the audience the template targets (architect
  // = cyan, mechanical = slate, electrical = emerald, blueprint =
  // indigo). Stay distinct from comic / animation / drawing palettes.
  const accent =
    id === "cad-floor-plan"
      ? { paper: "#f8fafc", grid: "#cbd5e1", ink: "#0f172a", chip: "bg-cyan-600 text-white" }
      : id === "cad-part-drawing"
      ? { paper: "#fafaf9", grid: "#d6d3d1", ink: "#1c1917", chip: "bg-slate-700 text-white" }
      : id === "cad-electrical-schematic"
      ? { paper: "#f0fdf4", grid: "#bbf7d0", ink: "#14532d", chip: "bg-emerald-600 text-white" }
      : { paper: "#1e3a8a", grid: "#3b82f6", ink: "#dbeafe", chip: "bg-indigo-300 text-indigo-950" };
  // Mock a few shapes appropriate to each id so cards read distinct
  // without proliferating switch cases.
  const overlay =
    id === "cad-floor-plan" ? (
      <>
        {/* Three rooms: outer rect, two inner walls, a door arc */}
        <rect x="6" y="6" width="88" height="44" fill="none" stroke={accent.ink} strokeWidth="1.5" />
        <line x1="40" y1="6" x2="40" y2="32" stroke={accent.ink} strokeWidth="1" />
        <line x1="40" y1="40" x2="40" y2="50" stroke={accent.ink} strokeWidth="1" />
        <line x1="6" y1="28" x2="40" y2="28" stroke={accent.ink} strokeWidth="1" />
        <path d="M 40 32 A 8 8 0 0 1 48 40" fill="none" stroke={accent.ink} strokeWidth="0.5" />
      </>
    ) : id === "cad-part-drawing" ? (
      <>
        {/* A part with two holes + leader lines */}
        <rect x="20" y="14" width="60" height="28" rx="3" fill="none" stroke={accent.ink} strokeWidth="1.5" />
        <circle cx="35" cy="28" r="3" fill="none" stroke={accent.ink} strokeWidth="1" />
        <circle cx="65" cy="28" r="3" fill="none" stroke={accent.ink} strokeWidth="1" />
        <line x1="20" y1="46" x2="80" y2="46" stroke={accent.ink} strokeWidth="0.5" />
        <text x="50" y="51" fontSize="3.5" textAnchor="middle" fill={accent.ink}>60mm</text>
      </>
    ) : id === "cad-electrical-schematic" ? (
      <>
        {/* A simple circuit: resistor + capacitor + ground */}
        <line x1="10" y1="28" x2="30" y2="28" stroke={accent.ink} strokeWidth="1" />
        <polyline points="30,28 33,22 39,34 45,22 51,34 54,28 70,28" fill="none" stroke={accent.ink} strokeWidth="1" />
        <line x1="70" y1="20" x2="70" y2="36" stroke={accent.ink} strokeWidth="1.5" />
        <line x1="74" y1="20" x2="74" y2="36" stroke={accent.ink} strokeWidth="1.5" />
        <line x1="72" y1="36" x2="72" y2="44" stroke={accent.ink} strokeWidth="1" />
        <line x1="66" y1="44" x2="78" y2="44" stroke={accent.ink} strokeWidth="1.5" />
        <line x1="68" y1="46" x2="76" y2="46" stroke={accent.ink} strokeWidth="1.5" />
      </>
    ) : (
      <>
        {/* Blueprint elevation: building outline + windows */}
        <rect x="10" y="10" width="80" height="40" fill="none" stroke={accent.ink} strokeWidth="1.5" />
        <polyline points="10,10 50,2 90,10" fill="none" stroke={accent.ink} strokeWidth="1.5" />
        <rect x="22" y="24" width="10" height="14" fill="none" stroke={accent.ink} strokeWidth="0.8" />
        <rect x="38" y="24" width="10" height="14" fill="none" stroke={accent.ink} strokeWidth="0.8" />
        <rect x="54" y="24" width="10" height="14" fill="none" stroke={accent.ink} strokeWidth="0.8" />
        <rect x="70" y="24" width="10" height="14" fill="none" stroke={accent.ink} strokeWidth="0.8" />
      </>
    );
  return (
    <div className="absolute inset-0" style={{ backgroundColor: accent.paper }}>
      <svg viewBox="0 0 100 56" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {/* Grid */}
        <defs>
          <pattern id={`cad-grid-${id}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke={accent.grid} strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100" height="56" fill={`url(#cad-grid-${id})`} />
        {overlay}
      </svg>
      <div className={cn("absolute bottom-1 right-1 rounded-sm px-1.5 py-0.5 text-[7px] font-bold", accent.chip)}>
        {preset.widthMm}×{preset.heightMm}{preset.unit}
      </div>
    </div>
  );
}

/**
 * Comic-genre thumbnail — a 6-panel mini comic page rendered from the
 * genre's palette. All 12 comic templates share this component (per
 * the DRY rule); palette differences make each genre's card visually
 * distinct. The 6-panel grid mirrors the 6-page narrative arc the AI
 * scaffolder produces, so the card visually previews what the user
 * will land in the editor with.
 */
export function ComicThumb({ genre }: { genre: (typeof COMIC_GENRES)[number] }) {
  const p = genre.palette;
  // Six tiny panels in a 3x2 grid — each gets a different accent dot
  // so the page reads as varied even at thumbnail size. The last panel
  // shows a CTA-shaped sliver to telegraph the closing-pitch beat.
  return (
    <div
      className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[3px] p-2"
      style={{ backgroundColor: p.paper }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="relative overflow-hidden"
          style={{
            backgroundColor: i === 5 ? p.accent : i % 2 === 0 ? p.primary : p.secondary,
            border: `1.5px solid ${p.ink}`,
          }}
        >
          {/* Character silhouette — only on panels 0/2/4 so half the
              page is "background-only" and half has a figure, the
              cheapest possible "comic page" read. */}
          {i % 2 === 0 && (
            <div
              className="absolute bottom-0 left-1/2 h-3/4 w-2/5 -translate-x-1/2 rounded-t-full"
              style={{ backgroundColor: p.ink, opacity: 0.85 }}
            />
          )}
          {/* Speech-bubble dot — top right of every panel except the
              last (which is the CTA-shaped final beat). */}
          {i !== 5 && (
            <div
              className="absolute right-1 top-1 h-1.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.paper, border: `1px solid ${p.ink}` }}
            />
          )}
          {/* SFX dot on the climax beat (panel 4). */}
          {i === 4 && (
            <div
              className="absolute right-1 bottom-1 h-2 w-2 rotate-12 rounded-sm"
              style={{ backgroundColor: p.accent, border: `1px solid ${p.ink}` }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
