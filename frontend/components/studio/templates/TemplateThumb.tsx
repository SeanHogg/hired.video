// Mock "slide preview" rendered inside each /studio template card. One
// switch per `template.id` so each template gets a unique visual identity
// (background, accent shape, title treatment) — modelled on PowerPoint /
// Canva template grids. Pure CSS + inline SVG, no image assets needed.

import { cn } from "@/lib/utils";
import type { ContentTemplate, TemplateDef } from "./catalog";
import { COMIC_GENRES, type ComicGenreId } from "@shared/comic-genres";
import { DRAWING_TEMPLATE_PRESETS } from "@/lib/studio/drawing/drawing-template-presets";
import DrawingPlaceholderThumbnail from "@/components/studio/drawing/DrawingPlaceholderThumbnail";
import { getAnimationTemplatePreset } from "@/lib/studio/animation/animation-seeds";
import { getCadTemplatePreset } from "@/lib/studio/cad/cad-seeds";

interface TemplateThumbProps {
  template: TemplateDef;
  className?: string;
}

export default function TemplateThumb({ template, className }: TemplateThumbProps) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-md",
        className,
      )}
    >
      {renderThumb(template.id)}
    </div>
  );
}

function renderThumb(id: ContentTemplate) {
  // Comic genre cards — one branch covers all 12 ids. Palette is read
  // from the SSoT (`COMIC_GENRES`) so adding a 13th genre needs ZERO
  // changes here — the per-id thumb shape is genre-derived. Per the
  // DRY rule: one branch in this switch, one inline `<ComicThumb>` body,
  // no per-genre case proliferation.
  if (id.startsWith("comic_")) {
    const genreId = id.slice("comic_".length) as ComicGenreId;
    const genre = COMIC_GENRES.find((g) => g.id === genreId) ?? COMIC_GENRES[0];
    return <ComicThumb genre={genre} />;
  }
  // Drawing-template thumbnails (#932 / #945). One derived branch
  // covers every drawing_* template — palette + dimensions come from
  // the single SSoT (`DRAWING_TEMPLATE_PRESETS`), so adding a new
  // drawing template needs ZERO changes here. Per DRY: one branch,
  // one inline `<DrawingThumb>` body, no per-template case
  // proliferation.
  if (id.startsWith("drawing_")) {
    const preset = DRAWING_TEMPLATE_PRESETS[id];
    if (preset) {
      return (
        <DrawingPlaceholderThumbnail
          width={preset.width}
          height={preset.height}
          accent={preset.accent}
          dimensionLabel={preset.dimensionLabel}
        />
      );
    }
  }
  // Animation-template thumbnails (#1003). Same derived-branch pattern
  // as comic + drawing — single SSoT (`ANIMATION_TEMPLATE_PRESETS` in
  // animation-seeds.ts) drives the visual (frame strip mini-preview at
  // the seed's starter frame count + fps badge), so adding a 5th
  // animation template needs ZERO changes here.
  if (id.startsWith("animation-")) {
    const preset = getAnimationTemplatePreset(id);
    if (preset) {
      return <AnimationThumb id={id} preset={preset} />;
    }
  }
  // CAD-template thumbnails (#930). Single SSoT
  // (`CAD_TEMPLATE_PRESETS` in cad-seeds.ts) drives the visual — a
  // technical-drawing-shaped grid + dimension callout + scale chip.
  // Adding a 5th CAD template needs ZERO changes here.
  if (id.startsWith("cad-")) {
    const preset = getCadTemplatePreset(id);
    if (preset) {
      return <CadThumb id={id} preset={preset} />;
    }
  }
  switch (id) {
    case "basic":
      return (
        <div className="absolute inset-0 bg-slate-100 p-3">
          <div className="h-3/5 w-full rounded-sm bg-gradient-to-br from-slate-300 to-slate-400" />
          <div className="mt-2 h-1.5 w-2/3 rounded-sm bg-slate-700" />
          <div className="mt-1 h-1 w-1/3 rounded-sm bg-slate-400" />
        </div>
      );

    case "profile":
      return (
        <div className="absolute inset-0 flex bg-[#e9e3da]">
          <div className="m-2 w-2/5 rounded-sm bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23c9bfae%22/><circle cx=%2250%22 cy=%2240%22 r=%2218%22 fill=%22%23a89882%22/><rect x=%2225%22 y=%2260%22 width=%2250%22 height=%2230%22 rx=%2010%22 fill=%22%23a89882%22/></svg>')] bg-cover" />
          <div className="flex flex-1 flex-col justify-center pr-3">
            <div className="text-[10px] font-semibold tracking-wider text-slate-700">
              PRESENTATION
            </div>
            <div className="text-[10px] font-semibold tracking-wider text-slate-700">
              TITLE
            </div>
            <div className="mt-1 text-[6px] tracking-widest text-slate-500">
              PRESENTATION SUBTITLE
            </div>
          </div>
        </div>
      );

    case "resume":
      return (
        <div className="absolute inset-0 bg-white p-3">
          <div className="h-1.5 w-1/3 rounded-sm bg-slate-800" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="h-1 w-full rounded-sm bg-slate-300" />
              <div className="h-1 w-5/6 rounded-sm bg-slate-300" />
              <div className="h-1 w-4/6 rounded-sm bg-slate-300" />
              <div className="h-1 w-full rounded-sm bg-slate-300" />
            </div>
            <div className="space-y-1">
              <div className="h-1 w-full rounded-sm bg-slate-300" />
              <div className="h-1 w-3/4 rounded-sm bg-slate-300" />
              <div className="h-1 w-full rounded-sm bg-slate-300" />
              <div className="h-1 w-2/3 rounded-sm bg-slate-300" />
            </div>
          </div>
          <div className="absolute bottom-2 right-3 text-[8px] font-bold tracking-widest text-rose-500">
            RESUME
          </div>
        </div>
      );

    case "personal_brand":
      return (
        <div className="absolute inset-0 flex flex-col justify-center bg-slate-900 px-4">
          <div className="text-[11px] font-bold leading-tight text-white">
            PRESENTATION
          </div>
          <div className="text-[11px] font-bold leading-tight text-white">
            TITLE
          </div>
          <div className="mt-2 h-px w-3/5 bg-rose-400" />
          <div className="mt-1 text-[6px] tracking-widest text-slate-400">
            Presentation subtitle
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl text-rose-400">
            ✶
          </div>
        </div>
      );

    case "skills_demo":
      return (
        <div className="absolute inset-0 flex flex-col justify-center bg-white px-3">
          <div className="text-[14px] font-extrabold leading-[1] text-slate-900">
            PRES
          </div>
          <div className="text-[14px] font-extrabold leading-[1] text-slate-900">
            TITLE
          </div>
          <div className="absolute bottom-2 right-3 flex gap-1">
            <div className="h-3 w-1 rounded-full bg-brand-purple" />
            <div className="h-4 w-1 rounded-full bg-brand-purple" />
            <div className="h-5 w-1 rounded-full bg-brand-purple" />
          </div>
        </div>
      );

    case "code_walkthrough":
      return (
        <div className="absolute inset-0 bg-slate-950 p-3 font-mono">
          <div className="text-[6px] text-emerald-400">{"> npm run dev"}</div>
          <div className="mt-1 h-1 w-2/3 rounded-sm bg-sky-500/60" />
          <div className="mt-1 h-1 w-3/4 rounded-sm bg-purple-400/60" />
          <div className="mt-1 h-1 w-1/2 rounded-sm bg-amber-400/60" />
          <div className="mt-1 h-1 w-5/6 rounded-sm bg-pink-400/60" />
          <div className="mt-1 h-1 w-2/5 rounded-sm bg-emerald-400/60" />
          <div className="absolute bottom-2 right-3 text-[8px] font-bold text-white">
            {"</code>"}
          </div>
        </div>
      );

    case "design_portfolio":
      return (
        <div className="absolute inset-0 bg-[#efe9e1]">
          <svg
            viewBox="0 0 100 56"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 h-full w-full"
          >
            <path
              d="M5 56 L5 28 A20 20 0 0 1 45 28 L45 56 Z"
              fill="#b8a89a"
            />
            <circle cx="22" cy="36" r="5" fill="#7a6b5a" />
          </svg>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-right">
            <div className="text-[9px] font-semibold tracking-wider text-slate-700">
              PRESENTATION
            </div>
            <div className="text-[9px] font-semibold tracking-wider text-slate-700">
              TITLE
            </div>
          </div>
        </div>
      );

    case "data_analysis":
      return (
        <div className="absolute inset-0 bg-white p-3">
          <div className="text-[7px] font-semibold uppercase tracking-wider text-slate-700">
            Q3 Insights
          </div>
          <div className="mt-2 flex h-3/5 items-end gap-1">
            <div className="h-2/5 flex-1 rounded-sm bg-sky-400" />
            <div className="h-3/5 flex-1 rounded-sm bg-sky-500" />
            <div className="h-4/5 flex-1 rounded-sm bg-brand-purple" />
            <div className="h-1/2 flex-1 rounded-sm bg-sky-400" />
            <div className="h-full flex-1 rounded-sm bg-brand-blue" />
            <div className="h-2/3 flex-1 rounded-sm bg-sky-500" />
          </div>
          <div className="absolute bottom-2 left-3 right-3 h-px bg-slate-300" />
        </div>
      );

    case "job_ad":
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-purple to-brand-blue p-3 text-white">
          <div className="text-[7px] font-semibold uppercase tracking-widest opacity-80">
            We&rsquo;re hiring
          </div>
          <div className="mt-1 text-[11px] font-bold leading-tight">
            Senior
          </div>
          <div className="text-[11px] font-bold leading-tight">Engineer</div>
          <div className="absolute bottom-2 right-3 rounded-full bg-white px-2 py-0.5 text-[7px] font-semibold text-brand-purple">
            Apply →
          </div>
        </div>
      );

    case "company_promo":
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-brand-purple to-brand-blue p-3 text-white">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-sm bg-white" />
            <div className="text-[6px] font-bold tracking-widest opacity-90">
              ACME CO.
            </div>
          </div>
          <div className="mt-3 text-[10px] font-bold leading-tight">
            Build with us.
          </div>
          <div className="mt-1 h-px w-1/3 bg-white/60" />
          <div className="mt-1 text-[6px] opacity-70">
            Join 200+ engineers shipping daily.
          </div>
        </div>
      );

    case "sizzle_reel":
      return (
        <div className="absolute inset-0 overflow-hidden bg-sky-200">
          <div className="absolute -left-4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute left-12 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute left-28 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute bottom-2 left-3 text-[10px] font-semibold text-slate-900">
            Sizzle Reel
          </div>
          <div className="absolute right-2 top-2 text-[6px] tracking-widest text-slate-700">
            PRESENTATION
          </div>
        </div>
      );

    case "tool_promo":
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-fuchsia-500 p-3 text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/20 text-base">
            🔧
          </div>
          <div className="mt-2 text-[10px] font-bold leading-tight">
            New Tool
          </div>
          <div className="text-[10px] font-bold leading-tight">Drop</div>
          <div className="mt-1 text-[6px] opacity-80">30-second demo</div>
        </div>
      );

    // ─── Film templates (#921) ────────────────────────────────────────────
    case "self_tape":
      // Slate-shaped card — black background, clapboard top strip, role
      // metadata stack mid, take-number bottom.
      return (
        <div className="absolute inset-0 bg-slate-900 p-2 text-white">
          <div className="flex gap-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-2 flex-1 -skew-x-12",
                  i % 2 === 0 ? "bg-white" : "bg-slate-900",
                )}
              />
            ))}
          </div>
          <div className="mt-3 text-[10px] font-bold tracking-wide">SELF-TAPE</div>
          <div className="mt-0.5 text-[7px] opacity-80">Role · Lead</div>
          <div className="text-[7px] opacity-80">Project · Indie feature</div>
          <div className="mt-2 inline-block rounded-sm bg-white/20 px-1.5 py-0.5 text-[7px]">
            TAKE 1
          </div>
        </div>
      );

    case "monologue":
      // Single centred microphone silhouette, deep stage backdrop.
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-black text-white">
          <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-90" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" fill="#fbbf24" />
            <path d="M5 11 a7 7 0 0 0 14 0" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
            <line x1="12" y1="18" x2="12" y2="22" stroke="#fbbf24" strokeWidth="1.5" />
            <line x1="9" y1="22" x2="15" y2="22" stroke="#fbbf24" strokeWidth="1.5" />
          </svg>
          <div className="mt-1 text-[8px] tracking-[0.3em] text-slate-300">MONOLOGUE</div>
        </div>
      );

    case "showreel":
      // Filmstrip border with three "frames" + reel title.
      return (
        <div className="absolute inset-0 bg-black p-2 text-white">
          <div className="absolute inset-y-0 left-0 flex w-2 flex-col justify-between py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-sm bg-white/70" />
            ))}
          </div>
          <div className="absolute inset-y-0 right-0 flex w-2 flex-col justify-between py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-sm bg-white/70" />
            ))}
          </div>
          <div className="mx-3 grid h-full grid-cols-3 gap-1">
            <div className="rounded-sm bg-gradient-to-br from-amber-700 to-amber-900" />
            <div className="rounded-sm bg-gradient-to-br from-rose-700 to-rose-900" />
            <div className="rounded-sm bg-gradient-to-br from-violet-700 to-violet-900" />
          </div>
          <div className="absolute bottom-1 left-3 right-3 text-center text-[8px] font-bold tracking-[0.3em]">
            ACTOR SHOWREEL
          </div>
        </div>
      );

    case "director_pitch":
      // Treatment-style card — bold logline at top, comp-titles row,
      // signature line.
      return (
        <div className="absolute inset-0 bg-[#1e1b4b] p-2 text-white">
          <div className="text-[6px] tracking-widest text-violet-300">LOGLINE</div>
          <div className="mt-0.5 text-[8px] font-bold leading-tight">
            A grieving cartographer races her sister
          </div>
          <div className="mt-0.5 text-[8px] font-bold leading-tight opacity-90">
            back to the last island
          </div>
          <div className="mt-2 flex gap-0.5">
            <span className="rounded-full bg-violet-500/30 px-1 py-0.5 text-[6px]">Drama</span>
            <span className="rounded-full bg-violet-500/30 px-1 py-0.5 text-[6px]">Coastal</span>
          </div>
          <div className="mt-2 text-[6px] opacity-70">— Lin Carrow, director</div>
        </div>
      );

    case "casting_call":
      // Role-listing card — title slate + bulleted role spec.
      return (
        <div className="absolute inset-0 bg-violet-700 p-2 text-white">
          <div className="text-[6px] tracking-widest text-amber-200">CASTING</div>
          <div className="mt-0.5 text-[10px] font-bold tracking-tight">JUNE — supporting lead</div>
          <div className="mt-2 space-y-0.5 text-[7px] opacity-90">
            <div>• 30-38 · any ethnicity</div>
            <div>• Stonington, ME · Sept 2026</div>
            <div>• SAG-AFTRA MLB</div>
          </div>
          <div className="absolute bottom-1 right-2 rounded-sm bg-amber-300 px-1 py-0.5 text-[7px] font-bold text-slate-900">
            DUE JUNE 19
          </div>
        </div>
      );

    // ─── Podcast templates (#921) ─────────────────────────────────────────
    case "podcast_trailer":
      // Subscribe-button + waveform — looks like a podcast directory card.
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900 to-slate-900 p-2 text-white">
          <div className="text-[6px] tracking-widest text-violet-300">PODCAST TRAILER</div>
          <div className="mt-0.5 text-[12px] font-extrabold leading-tight">HIRED.</div>
          <ThumbWaveformBars accent="#c4b5fd" bars={36} />
          <div className="absolute bottom-1 right-2 rounded-full bg-violet-400 px-1.5 py-0.5 text-[7px] font-bold text-violet-950">
            ▶ TRAILER
          </div>
        </div>
      );

    case "podcast_episode":
      // Chapter-marked waveform — recognizable Apple Podcasts chapter cue.
      return (
        <div className="absolute inset-0 bg-slate-900 p-2 text-white">
          <div className="text-[6px] tracking-widest text-slate-400">EPISODE 12</div>
          <div className="mt-0.5 text-[9px] font-bold leading-tight">
            "I quit a six-figure job to make ramen."
          </div>
          <ThumbWaveformBars accent="#a78bfa" bars={40} chapters={[0.15, 0.45, 0.75]} />
          <div className="absolute bottom-1 left-2 right-2 flex justify-between text-[7px] opacity-70">
            <span>00:00</span>
            <span>42:18</span>
          </div>
        </div>
      );

    case "podcast_interview":
      // Two-mic icon — clearly distinct from the solo-mic monologue card.
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-violet-800 to-slate-900 p-2 text-white">
          <div className="flex gap-3">
            {[0, 1].map((i) => (
              <svg key={i} viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" fill={i === 0 ? "#fde68a" : "#a78bfa"} />
                <path d="M5 11 a7 7 0 0 0 14 0" fill="none" stroke={i === 0 ? "#fde68a" : "#a78bfa"} strokeWidth="1.5" />
              </svg>
            ))}
          </div>
          <div className="mt-1 text-[8px] tracking-[0.25em] text-slate-300">INTERVIEW</div>
        </div>
      );

    // ─── Voice templates (#921 + Phase 4) ─────────────────────────────────
    case "voice_audition_reel":
      // Three stacked mini-waveforms — three reads in the reel.
      return (
        <div className="absolute inset-0 bg-slate-900 p-2 text-white">
          <div className="text-[6px] tracking-widest text-amber-300">VOICE AUDITION</div>
          <div className="mt-0.5 text-[8px] font-bold leading-tight">Jamie Bell · Bell &amp; Co</div>
          <div className="mt-1.5 flex flex-col gap-1">
            {[{ label: "Warm", bars: 14 }, { label: "Energetic", bars: 16 }, { label: "Character", bars: 12 }].map(
              (read, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <span className="w-12 text-[6px] opacity-70">{read.label}</span>
                  <ThumbWaveformBars
                    accent="#fbbf24"
                    bars={read.bars}
                    height="h-2"
                    inline
                  />
                </div>
              ),
            )}
          </div>
        </div>
      );

    case "voice_ivr_prompt":
      // Phone receiver + numbered menu lines.
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-amber-50 p-2 text-slate-900">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path
              d="M5 4a2 2 0 0 1 2-2h2.5l1.5 4-2 1.5a14 14 0 0 0 6 6L16.5 11l4 1.5V15a2 2 0 0 1-2 2h-1A14 14 0 0 1 4 6V5z"
              fill="#92400e"
            />
          </svg>
          <div className="mt-1 text-[7px] font-bold tracking-widest text-amber-900">IVR PROMPT</div>
          <div className="mt-1 space-y-0.5 text-[7px] text-slate-800">
            <div>1 · Sales</div>
            <div>2 · Support</div>
            <div>0 · Reach a person</div>
          </div>
        </div>
      );

    case "voice_audiobook_chapter":
      // Book spine + headphones overlay — distinctly "audiobook".
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-950 p-2 text-stone-100">
          <div className="text-[6px] tracking-widest text-amber-300">AUDIOBOOK</div>
          <div className="mt-0.5 text-[10px] font-bold leading-tight">The Last Ferry</div>
          <div className="text-[7px] opacity-70">Chapter Four · The crossing</div>
          <svg viewBox="0 0 24 24" className="absolute bottom-1 right-1 h-7 w-7 opacity-90" aria-hidden="true">
            <path
              d="M4 13a8 8 0 0 1 16 0v5h-3v-5a5 5 0 0 0-10 0v5H4z"
              fill="none"
              stroke="#fde68a"
              strokeWidth="1.5"
            />
            <rect x="4" y="14" width="3" height="6" rx="1" fill="#fde68a" />
            <rect x="17" y="14" width="3" height="6" rx="1" fill="#fde68a" />
          </svg>
        </div>
      );

    case "product_promo":
      // Problem → Product → Proof → CTA arc — render as a 4-card mini
      // storyboard with a megaphone accent so it reads as "marketing".
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-700 to-violet-800 p-2 text-white">
          <div className="text-[6px] tracking-widest text-fuchsia-200">PROMO</div>
          <div className="mt-0.5 text-[10px] font-bold leading-tight">
            New product launch
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-0.5">
            {["P", "P", "P", "★"].map((label, i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-sm bg-white/15 text-[8px] font-bold"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="mt-1 text-[6px] opacity-80">Problem · Product · Proof · CTA</div>
          <div className="absolute bottom-1 right-1 rounded-full bg-fuchsia-300 px-1.5 py-0.5 text-[7px] font-bold text-fuchsia-950">
            30 SEC
          </div>
        </div>
      );

    // ─── Game templates (#927) ────────────────────────────────────────────
    case "endless_runner":
      // Side-scrolling parallax with a player sprite hop + ground tiles +
      // obstacle silhouette. Reads as "platformer game".
      return (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-sky-400 to-sky-600">
          {/* Mountain silhouette */}
          <svg className="absolute inset-x-0 bottom-6 h-8 w-full" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="0,30 20,8 35,18 55,4 75,16 100,6 100,30" fill="#475569" opacity="0.7" />
          </svg>
          {/* Ground */}
          <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-emerald-600 to-emerald-800" />
          {/* Player sprite — a happy box with eyes */}
          <div className="absolute bottom-6 left-4 h-5 w-5 rounded-sm bg-amber-300 ring-1 ring-amber-900">
            <div className="absolute left-1 top-1 h-1 w-1 rounded-full bg-amber-950" />
            <div className="absolute right-1 top-1 h-1 w-1 rounded-full bg-amber-950" />
          </div>
          {/* Obstacle */}
          <div className="absolute bottom-6 right-8 h-4 w-2 rounded-t-sm bg-rose-700" />
          <div className="absolute bottom-1 left-2 text-[7px] font-bold tracking-widest text-white">
            ENDLESS RUNNER
          </div>
          <div className="absolute right-2 top-2 rounded-sm bg-black/40 px-1.5 py-0.5 text-[7px] font-bold text-white">
            SCORE 0
          </div>
        </div>
      );

    case "quiz_game":
      // Question card + 4 answer buttons grid.
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 p-2 text-white">
          <div className="text-[6px] tracking-widest text-indigo-300">QUIZ · QUESTION 1 / 10</div>
          <div className="mt-1 rounded-sm bg-white/10 px-2 py-1.5 text-[9px] font-bold leading-tight">
            Which planet has the most moons?
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {[
              { label: "A Jupiter", correct: false },
              { label: "B Saturn",  correct: true  },
              { label: "C Mars",    correct: false },
              { label: "D Venus",   correct: false },
            ].map((opt) => (
              <div
                key={opt.label}
                className={cn(
                  "rounded-sm px-1 py-1 text-[7px] font-semibold",
                  opt.correct ? "bg-emerald-500/30" : "bg-white/10",
                )}
              >
                {opt.label}
              </div>
            ))}
          </div>
          <div className="absolute bottom-1 right-1 rounded-full bg-indigo-400 px-1.5 py-0.5 text-[7px] font-bold text-indigo-950">
            ★ 0
          </div>
        </div>
      );

    case "memory_match":
      // 4×4 grid of card backs with one flipped pair revealed.
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-emerald-950 p-2 text-emerald-50">
          <div className="text-[6px] tracking-widest text-emerald-300">MEMORY MATCH · 00:32</div>
          <div className="mt-1.5 grid grid-cols-4 gap-0.5">
            {Array.from({ length: 16 }).map((_, i) => {
              // Reveal one pair (cards 5 + 10) as a teaser.
              const isFlipped = i === 5 || i === 10;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-sm text-[8px] font-bold",
                    isFlipped
                      ? "bg-amber-300 text-emerald-950"
                      : "bg-emerald-600 ring-1 ring-emerald-400/40",
                  )}
                >
                  {isFlipped ? "★" : ""}
                </div>
              );
            })}
          </div>
          <div className="absolute bottom-1 right-1 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[7px] font-bold text-emerald-950">
            8 MOVES
          </div>
        </div>
      );
  }
}

/**
 * Animation-template thumbnail — frame-strip mini-preview. All 4
 * animation templates share this component (DRY); the preset's
 * `starterFrames` count drives the strip length + `fps` drives the
 * label so each template's card visually previews the strip you'll
 * land in the editor with. Per-template accent reads from the id
 * suffix so each card stays visually distinct (logo loop = brand
 * purple, spinner = mono, reaction = warm, explainer = teal).
 */
function AnimationThumb({
  id,
  preset,
}: {
  id: string;
  preset: { width: number; height: number; fps: number; starterFrames: number };
}) {
  // Per-id accent. Reads off the trailing slug so the four templates
  // are visually distinct without proliferating switch cases.
  const accent =
    id === "animation-logo-loop"
      ? { bg: "from-violet-600 to-fuchsia-700", chip: "bg-violet-300 text-violet-950" }
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
      <div className="text-[6px] tracking-widest opacity-80">ANIMATION</div>
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
function CadThumb({
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
function ComicThumb({ genre }: { genre: (typeof COMIC_GENRES)[number] }) {
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

/**
 * Small inline waveform bar set — used by podcast / voice thumbnails.
 * Self-contained (no caller-passed peaks) so each thumbnail stays a
 * one-line render.
 */
function ThumbWaveformBars({
  accent,
  bars,
  chapters,
  height = "h-6",
  inline = false,
}: {
  accent: string;
  bars: number;
  chapters?: number[];
  height?: string;
  inline?: boolean;
}) {
  // Deterministic bar heights — fixed pattern so every render is stable
  // and the visual reads as "envelope" rather than uniform.
  const bar = (i: number) => {
    const wave = Math.sin(i * 0.7) * 0.5 + 0.5;
    return 0.25 + wave * 0.7;
  };
  return (
    <div
      className={cn(
        "mt-1 flex items-end gap-[1px]",
        height,
        inline ? "flex-1" : "w-full",
      )}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const heightPct = `${Math.round(bar(i) * 100)}%`;
        const isChapter = chapters?.some((c) => Math.abs(i / bars - c) < 1 / (bars * 2));
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              height: heightPct,
              backgroundColor: accent,
              opacity: isChapter ? 1 : 0.7,
              boxShadow: isChapter ? `0 0 0 1px ${accent}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
