// Named style bundles for resume templates. Tailwind JIT needs static class
// strings, so each theme is a pre-baked set of classes — descriptor.theme.themeKey
// picks one.

export type ThemeKey =
  | "hired-purple"
  | "iron-gray"
  | "balanced-blue"
  | "trusted-taupe"
  | "assertive-asphalt"
  | "warm-amber"
  | "executive-navy"
  | "minimal-slate"
  | "dev-graphite"
  | "growth-emerald";

export interface ThemeStyles {
  key: ThemeKey;
  label: string;
  // Document surface
  pageBg: string;          // outer page bg for print mode
  paperBg: string;         // the A4 paper surface
  // Typography
  baseText: string;
  nameText: string;
  // Accents
  accentText: string;      // section titles, section icons, role names
  accentBorder: string;    // heading underline / dividers
  accentBgSoft: string;    // light chip/keyword bg
  // Hero-mode gradient (only used when documentMode === "hero")
  heroGradient: string;
  heroForeground: string;
}

export const THEMES: Record<ThemeKey, ThemeStyles> = {
  "hired-purple": {
    key: "hired-purple",
    label: "Hired Purple",
    pageBg: "bg-background",
    paperBg: "bg-card",
    baseText: "text-foreground",
    nameText: "text-foreground",
    accentText: "text-primary",
    accentBorder: "border-primary",
    accentBgSoft: "bg-primary/10",
    heroGradient: "bg-gradient-to-br from-primary via-primary/90 to-primary/80",
    heroForeground: "text-primary-foreground",
  },
  "iron-gray": {
    key: "iron-gray",
    label: "Iron Gray",
    pageBg: "bg-slate-100",
    paperBg: "bg-white",
    baseText: "text-slate-900",
    nameText: "text-slate-800",
    accentText: "text-slate-700",
    accentBorder: "border-slate-700",
    accentBgSoft: "bg-slate-100",
    heroGradient: "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900",
    heroForeground: "text-white",
  },
  "balanced-blue": {
    key: "balanced-blue",
    label: "Balanced Blue",
    pageBg: "bg-blue-50",
    paperBg: "bg-white",
    baseText: "text-slate-900",
    nameText: "text-blue-900",
    accentText: "text-blue-700",
    accentBorder: "border-blue-700",
    accentBgSoft: "bg-blue-50",
    heroGradient: "bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900",
    heroForeground: "text-white",
  },
  "trusted-taupe": {
    key: "trusted-taupe",
    label: "Trusted Taupe",
    pageBg: "bg-stone-100",
    paperBg: "bg-white",
    baseText: "text-stone-900",
    nameText: "text-stone-800",
    accentText: "text-stone-600",
    accentBorder: "border-stone-500",
    accentBgSoft: "bg-stone-100",
    heroGradient: "bg-gradient-to-br from-stone-600 via-stone-700 to-stone-800",
    heroForeground: "text-white",
  },
  "assertive-asphalt": {
    key: "assertive-asphalt",
    label: "Assertive Asphalt",
    pageBg: "bg-zinc-100",
    paperBg: "bg-white",
    baseText: "text-zinc-900",
    nameText: "text-zinc-900",
    accentText: "text-zinc-800",
    accentBorder: "border-zinc-900",
    accentBgSoft: "bg-zinc-200",
    heroGradient: "bg-gradient-to-br from-zinc-800 via-zinc-900 to-black",
    heroForeground: "text-white",
  },
  "warm-amber": {
    key: "warm-amber",
    label: "Warm Amber",
    pageBg: "bg-amber-50",
    paperBg: "bg-white",
    baseText: "text-stone-900",
    nameText: "text-amber-900",
    accentText: "text-amber-700",
    accentBorder: "border-amber-600",
    accentBgSoft: "bg-amber-100",
    heroGradient: "bg-gradient-to-br from-amber-600 via-amber-700 to-orange-800",
    heroForeground: "text-white",
  },
  "executive-navy": {
    key: "executive-navy",
    label: "Executive Navy",
    pageBg: "bg-slate-100",
    paperBg: "bg-white",
    baseText: "text-slate-900",
    nameText: "text-slate-900",
    accentText: "text-slate-700",
    accentBorder: "border-slate-900",
    accentBgSoft: "bg-slate-100",
    heroGradient: "bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950",
    heroForeground: "text-white",
  },
  "minimal-slate": {
    key: "minimal-slate",
    label: "Minimal Slate",
    pageBg: "bg-white",
    paperBg: "bg-white",
    baseText: "text-neutral-900",
    nameText: "text-neutral-900",
    accentText: "text-neutral-600",
    accentBorder: "border-neutral-300",
    accentBgSoft: "bg-neutral-100",
    heroGradient: "bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-900",
    heroForeground: "text-white",
  },
  "dev-graphite": {
    key: "dev-graphite",
    label: "Dev Graphite",
    pageBg: "bg-slate-50",
    paperBg: "bg-white",
    baseText: "text-slate-900",
    nameText: "text-slate-900",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-600",
    accentBgSoft: "bg-emerald-50",
    heroGradient: "bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-900",
    heroForeground: "text-white",
  },
  "growth-emerald": {
    key: "growth-emerald",
    label: "Growth Emerald",
    pageBg: "bg-emerald-50",
    paperBg: "bg-white",
    baseText: "text-slate-900",
    nameText: "text-emerald-900",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-600",
    accentBgSoft: "bg-emerald-100",
    heroGradient: "bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900",
    heroForeground: "text-white",
  },
};

export type FontFamilyKey = "sans" | "serif" | "mono";
export const FONT_FAMILY_CLASS: Record<FontFamilyKey, string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

export type HeadingStyle = "underlined" | "divider" | "caps" | "plain";
export type Density = "compact" | "comfortable" | "spacious";

export const DENSITY_CLASS: Record<Density, { section: string; entry: string }> = {
  compact: { section: "space-y-6", entry: "space-y-2" },
  comfortable: { section: "space-y-10", entry: "space-y-4" },
  spacious: { section: "space-y-14", entry: "space-y-6" },
};
