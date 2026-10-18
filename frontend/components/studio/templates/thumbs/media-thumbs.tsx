// Static per-template thumbnails — data map keyed by template id (one
// entry per template; TemplateThumb looks the id up, no switch).

import { cn } from "@/lib/utils";
import type { TemplateThumbMap } from "./types";
import ThumbWaveformBars from "./ThumbWaveformBars";

export const MEDIA_TEMPLATE_THUMBS: TemplateThumbMap = {
  monologue: (t) => {
    // Single centred microphone silhouette, deep stage backdrop.
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-black text-white">
        <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-90" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" fill="#fbbf24" />
          <path d="M5 11 a7 7 0 0 0 14 0" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
          <line x1="12" y1="18" x2="12" y2="22" stroke="#fbbf24" strokeWidth="1.5" />
          <line x1="9" y1="22" x2="15" y2="22" stroke="#fbbf24" strokeWidth="1.5" />
        </svg>
        <div className="mt-1 text-[8px] tracking-[0.3em] text-slate-300 truncate">{t("studio.templateThumb.monologue")}</div>
      </div>
    );
  },
  showreel: (t) => {
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
          <div className="rounded-sm bg-gradient-to-br from-sky-700 to-sky-900" />
        </div>
        <div className="absolute bottom-1 left-3 right-3 text-center text-[8px] font-bold tracking-[0.3em] truncate">
          {t("studio.templateThumb.actorShowreel")}
        </div>
      </div>
    );
  },
  director_pitch: (t) => {
    // Treatment-style card — bold logline at top, comp-titles row,
    // signature line.
    return (
      <div className="absolute inset-0 bg-[#1e1b4b] p-2 text-white">
        <div className="text-[6px] tracking-widest text-sky-300 truncate">{t("studio.templateThumb.logline")}</div>
        <div className="mt-0.5 text-[8px] font-bold leading-tight line-clamp-2 break-words">
          {t("studio.templateThumb.loglineLine1")}
        </div>
        <div className="mt-0.5 text-[8px] font-bold leading-tight opacity-90 line-clamp-2 break-words">
          {t("studio.templateThumb.loglineLine2")}
        </div>
        <div className="mt-2 flex min-w-0 gap-0.5">
          <span className="rounded-full bg-sky-500/30 px-1 py-0.5 text-[6px] min-w-0 max-w-full truncate">{t("studio.templateThumb.genreDrama")}</span>
          <span className="rounded-full bg-sky-500/30 px-1 py-0.5 text-[6px] min-w-0 max-w-full truncate">{t("studio.templateThumb.genreCoastal")}</span>
        </div>
        <div className="mt-2 text-[6px] opacity-70 truncate">{t("studio.templateThumb.directorByline")}</div>
      </div>
    );
  },
  casting_call: (t) => {
    // Role-listing card — title slate + bulleted role spec.
    return (
      <div className="absolute inset-0 bg-sky-700 p-2 text-white">
        <div className="text-[6px] tracking-widest text-amber-200 truncate">{t("studio.templateThumb.casting")}</div>
        <div className="mt-0.5 text-[10px] font-bold tracking-tight truncate">{t("studio.templateThumb.castingRole")}</div>
        <div className="mt-2 space-y-0.5 text-[7px] opacity-90">
          <div className="truncate">• {t("studio.templateThumb.castingAge")}</div>
          <div className="truncate">• {t("studio.templateThumb.castingLocation")}</div>
          <div>• SAG-AFTRA MLB</div>
        </div>
        <div className="absolute bottom-1 right-2 rounded-sm bg-amber-300 px-1 py-0.5 text-[7px] font-bold text-slate-900 max-w-[85%] truncate">
          {t("studio.templateThumb.castingDue")}
        </div>
      </div>
    );

  // ─── Podcast templates (#921) ─────────────────────────────────────────
  },
  podcast_trailer: (t) => {
    // Subscribe-button + waveform — looks like a podcast directory card.
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-sky-900 to-slate-900 p-2 text-white">
        <div className="text-[6px] tracking-widest text-sky-300 truncate">{t("studio.templateThumb.podcastTrailer")}</div>
        <div className="mt-0.5 text-[12px] font-extrabold leading-tight">HIRED.</div>
        <ThumbWaveformBars accent="#c4b5fd" bars={36} />
        <div className="absolute bottom-1 right-2 rounded-full bg-sky-400 px-1.5 py-0.5 text-[7px] font-bold text-sky-950 max-w-[85%] truncate">
          ▶ {t("studio.templateThumb.trailerChip")}
        </div>
      </div>
    );
  },
  podcast_episode: (t) => {
    // Chapter-marked waveform — recognizable Apple Podcasts chapter cue.
    return (
      <div className="absolute inset-0 bg-slate-900 p-2 text-white">
        <div className="text-[6px] tracking-widest text-slate-400 truncate">{t("studio.templateThumb.episode", { number: 12 })}</div>
        <div className="mt-0.5 text-[9px] font-bold leading-tight line-clamp-2 break-words">
          {t("studio.templateThumb.episodeQuote")}
        </div>
        <ThumbWaveformBars accent="#a78bfa" bars={40} chapters={[0.15, 0.45, 0.75]} />
        <div className="absolute bottom-1 left-2 right-2 flex justify-between text-[7px] opacity-70">
          <span>00:00</span>
          <span>42:18</span>
        </div>
      </div>
    );
  },
  podcast_interview: (t) => {
    // Two-mic icon — clearly distinct from the solo-mic monologue card.
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-sky-800 to-slate-900 p-2 text-white">
        <div className="flex gap-3">
          {[0, 1].map((i) => (
            <svg key={i} viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" fill={i === 0 ? "#fde68a" : "#a78bfa"} />
              <path d="M5 11 a7 7 0 0 0 14 0" fill="none" stroke={i === 0 ? "#fde68a" : "#a78bfa"} strokeWidth="1.5" />
            </svg>
          ))}
        </div>
        <div className="mt-1 text-[8px] tracking-[0.25em] text-slate-300 truncate">{t("studio.templateThumb.interview")}</div>
      </div>
    );

  // ─── Voice templates (#921 + Phase 4) ─────────────────────────────────
  },
  voice_audition_reel: (t) => {
    // Three stacked mini-waveforms — three reads in the reel.
    return (
      <div className="absolute inset-0 bg-slate-900 p-2 text-white">
        <div className="text-[6px] tracking-widest text-amber-300 truncate">{t("studio.templateThumb.voiceAudition")}</div>
        <div className="mt-0.5 text-[8px] font-bold leading-tight">Jamie Bell · Bell &amp; Co</div>
        <div className="mt-1.5 flex flex-col gap-1">
          {[{ label: t("studio.templateThumb.readWarm"), bars: 14 }, { label: t("studio.templateThumb.readEnergetic"), bars: 16 }, { label: t("studio.templateThumb.readCharacter"), bars: 12 }].map(
            (read, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="w-12 shrink-0 truncate text-[6px] opacity-70">{read.label}</span>
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
  },
  voice_ivr_prompt: (t) => {
    // Phone receiver + numbered menu lines.
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-amber-50 p-2 text-slate-900">
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <path
            d="M5 4a2 2 0 0 1 2-2h2.5l1.5 4-2 1.5a14 14 0 0 0 6 6L16.5 11l4 1.5V15a2 2 0 0 1-2 2h-1A14 14 0 0 1 4 6V5z"
            fill="#92400e"
          />
        </svg>
        <div className="mt-1 text-[7px] font-bold tracking-widest text-amber-900 truncate">{t("studio.templateThumb.ivrPrompt")}</div>
        <div className="mt-1 space-y-0.5 text-[7px] text-slate-800">
          <div className="truncate">1 · {t("studio.templateThumb.ivrSales")}</div>
          <div className="truncate">2 · {t("studio.templateThumb.ivrSupport")}</div>
          <div className="truncate">0 · {t("studio.templateThumb.ivrPerson")}</div>
        </div>
      </div>
    );
  },
  voice_audiobook_chapter: (t) => {
    // Book spine + headphones overlay — distinctly "audiobook".
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-950 p-2 text-stone-100">
        <div className="text-[6px] tracking-widest text-amber-300 truncate">{t("studio.templateThumb.audiobook")}</div>
        <div className="mt-0.5 text-[10px] font-bold leading-tight line-clamp-2 break-words">{t("studio.templateThumb.audiobookTitle")}</div>
        <div className="text-[7px] opacity-70 truncate">{t("studio.templateThumb.audiobookChapter")}</div>
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
  },
  product_promo: (t) => {
    // Problem → Product → Proof → CTA arc — render as a 4-card mini
    // storyboard with a megaphone accent so it reads as "marketing".
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-teal-700 to-sky-800 p-2 text-white">
        <div className="text-[6px] tracking-widest text-teal-200 truncate">{t("studio.templateThumb.promo")}</div>
        <div className="mt-0.5 text-[10px] font-bold leading-tight line-clamp-2 break-words">
          {t("studio.templateThumb.promoTitle")}
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
        <div className="mt-1 text-[6px] opacity-80 truncate">{t("studio.templateThumb.promoArc")}</div>
        <div className="absolute bottom-1 right-1 rounded-full bg-teal-300 px-1.5 py-0.5 text-[7px] font-bold text-teal-950 max-w-[85%] truncate">
          {t("studio.templateThumb.promoDuration", { seconds: 30 })}
        </div>
      </div>
    );

  // ─── Game templates (#927) ────────────────────────────────────────────
  },
  endless_runner: (t) => {
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
        <div className="absolute bottom-1 left-2 text-[7px] font-bold tracking-widest text-white max-w-[85%] truncate">
          {t("studio.templateThumb.endlessRunner")}
        </div>
        <div className="absolute right-2 top-2 rounded-sm bg-black/40 px-1.5 py-0.5 text-[7px] font-bold text-white max-w-[85%] truncate">
          {t("studio.templateThumb.score", { score: 0 })}
        </div>
      </div>
    );
  },
  quiz_game: (t) => {
    // Question card + 4 answer buttons grid.
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 p-2 text-white">
        <div className="text-[6px] tracking-widest text-indigo-300 truncate">{t("studio.templateThumb.quizHeader", { current: 1, total: 10 })}</div>
        <div className="mt-1 rounded-sm bg-white/10 px-2 py-1.5 text-[9px] font-bold leading-tight line-clamp-2 break-words">
          {t("studio.templateThumb.quizQuestion")}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {[
            { key: "A", label: `A ${t("studio.templateThumb.planetJupiter")}`, correct: false },
            { key: "B", label: `B ${t("studio.templateThumb.planetSaturn")}`, correct: true },
            { key: "C", label: `C ${t("studio.templateThumb.planetMars")}`, correct: false },
            { key: "D", label: `D ${t("studio.templateThumb.planetVenus")}`, correct: false },
          ].map((opt) => (
            <div
              key={opt.key}
              className={cn(
                "min-w-0 truncate rounded-sm px-1 py-1 text-[7px] font-semibold",
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
  },
  memory_match: (t) => {
    // 4×4 grid of card backs with one flipped pair revealed.
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-emerald-950 p-2 text-emerald-50">
        <div className="text-[6px] tracking-widest text-emerald-300 truncate">{t("studio.templateThumb.memoryMatch", { time: "00:32" })}</div>
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
        <div className="absolute bottom-1 right-1 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[7px] font-bold text-emerald-950 max-w-[85%] truncate">
          {t("studio.templateThumb.moves", { moves: 8 })}
        </div>
      </div>
    );
  },
};
