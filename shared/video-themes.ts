/**
 * Video themes — the palettes a video can wear for a moment in the year
 * (Halloween, Graduation, Back to school…) or as an everyday choice
 * (Standard, Clean). EVERY theme is free.
 *
 * The theme calendar (shared/theme-calendar) picks one by date as the
 * default; the person can always pick another. Colours are hex because the
 * video renders to pixels, not CSS tokens, and every ground keeps white text
 * readable (same contract as the scene looks in video-composition.ts).
 */

/** How a theme speaks: "respectful" themes (observances, In memory) get a
 *  quiet design and never an opening line or a joke. */
export const THEME_TONES = ["playful", "warm", "respectful"] as const;
export type ThemeTone = (typeof THEME_TONES)[number];

export interface VideoTheme {
  /** Gradient start (also the solid fallback colour). */
  from: string;
  to: string;
  /** Kicker / first body line / avatar ring. */
  accent: string;
  tone: ThemeTone;
}

export const VIDEO_THEMES = {
  standard: { from: "#111827", to: "#6D28D9", accent: "#FDE68A", tone: "warm" },
  clean: { from: "#0F172A", to: "#1E3A8A", accent: "#BFDBFE", tone: "warm" },
  newyear: { from: "#111827", to: "#4C1D95", accent: "#FDE68A", tone: "playful" },
  grad: { from: "#1E3A8A", to: "#0F172A", accent: "#FDE68A", tone: "warm" },
  labor: { from: "#1E40AF", to: "#B91C1C", accent: "#FFFFFF", tone: "warm" },
  boss: { from: "#0F172A", to: "#334155", accent: "#FCD34D", tone: "warm" },
  valentine: { from: "#9F1239", to: "#E11D48", accent: "#FECDD3", tone: "playful" },
  stpat: { from: "#14532D", to: "#16A34A", accent: "#BBF7D0", tone: "playful" },
  spring: { from: "#065F46", to: "#0D9488", accent: "#FEF9C3", tone: "warm" },
  mothers: { from: "#9D174D", to: "#DB2777", accent: "#FCE7F3", tone: "warm" },
  fathers: { from: "#1E3A8A", to: "#0369A1", accent: "#E0F2FE", tone: "warm" },
  canada: { from: "#991B1B", to: "#DC2626", accent: "#FFFFFF", tone: "warm" },
  july4: { from: "#1E3A8A", to: "#B91C1C", accent: "#FFFFFF", tone: "playful" },
  coffee: { from: "#3F2A1D", to: "#78350F", accent: "#FDE68A", tone: "playful" },
  thanks: { from: "#78350F", to: "#B45309", accent: "#FDE68A", tone: "warm" },
  sweetest: { from: "#831843", to: "#BE185D", accent: "#FBCFE8", tone: "playful" },
  halloween: { from: "#1C1917", to: "#7C2D12", accent: "#FDBA74", tone: "playful" },
  fall: { from: "#451A03", to: "#9A3412", accent: "#FCD34D", tone: "warm" },
  cider: { from: "#7C2D12", to: "#C2410C", accent: "#FEF3C7", tone: "warm" },
  christmas: { from: "#14532D", to: "#166534", accent: "#FDE68A", tone: "warm" },
  holidays: { from: "#0C4A6E", to: "#1E3A8A", accent: "#BAE6FD", tone: "warm" },
  winter: { from: "#1E293B", to: "#334155", accent: "#E2E8F0", tone: "warm" },
  summer: { from: "#0369A1", to: "#B45309", accent: "#FFFFFF", tone: "playful" },
  biggame: { from: "#14532D", to: "#365314", accent: "#FFFFFF", tone: "playful" },
  wintergames: { from: "#0C4A6E", to: "#0369A1", accent: "#E0F2FE", tone: "playful" },
  bracket: { from: "#7C2D12", to: "#C2410C", accent: "#FFF7ED", tone: "playful" },
  baseball: { from: "#1E3A8A", to: "#1E40AF", accent: "#FECACA", tone: "playful" },
  finals: { from: "#111827", to: "#7C3AED", accent: "#DDD6FE", tone: "playful" },
  soccer: { from: "#14532D", to: "#15803D", accent: "#FEF08A", tone: "playful" },
  football: { from: "#3F2A1D", to: "#14532D", accent: "#FDE68A", tone: "playful" },
  observe: { from: "#312E81", to: "#4338CA", accent: "#E0E7FF", tone: "respectful" },
  veteran: { from: "#1F2937", to: "#1E3A8A", accent: "#E5E7EB", tone: "respectful" },
  school: { from: "#14532D", to: "#1F2937", accent: "#FDE68A", tone: "warm" },
  workanniv: { from: "#0F766E", to: "#0369A1", accent: "#CCFBF1", tone: "warm" },
  birthday: { from: "#7C3AED", to: "#DB2777", accent: "#FDE68A", tone: "playful" },
  wedding: { from: "#9D174D", to: "#7C3AED", accent: "#FCE7F3", tone: "warm" },
  memory: { from: "#334155", to: "#475569", accent: "#E2E8F0", tone: "respectful" },
} as const satisfies Record<string, VideoTheme>;

export type VideoThemeId = keyof typeof VIDEO_THEMES;
export const VIDEO_THEME_IDS = Object.keys(VIDEO_THEMES) as VideoThemeId[];

/** Everyday themes offered whatever the date (Settings › "Always use"). */
export const EVERYDAY_THEME_IDS = ["standard", "clean", "fall", "winter", "spring", "summer"] as const satisfies readonly VideoThemeId[];

export function isVideoThemeId(value: unknown): value is VideoThemeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(VIDEO_THEMES, value);
}

/** i18n key of a theme's name (flat keys in frontend/public/locales). */
export function videoThemeLabelKey(id: VideoThemeId): string {
  return `videoTheme.${id}`;
}
