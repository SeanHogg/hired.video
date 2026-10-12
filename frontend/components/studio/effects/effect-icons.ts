/**
 * Picker grid icons — one per registered effect kind. Kept in the UI
 * layer rather than on the registry definition so library code in
 * `lib/timeline/effects/*` stays free of React/lucide imports. The
 * picker falls back to `Sparkle` for any unknown kind.
 */
import {
  Activity,
  Aperture,
  Asterisk,
  Coffee,
  Contrast,
  Droplet,
  Eye,
  EyeOff,
  Film,
  FlipHorizontal2,
  Grid3x3,
  Layers,
  Move,
  MoveLeft,
  MoveRight,
  PaintBucket,
  Palette,
  Pipette,
  Rows3,
  Scissors,
  Snowflake,
  Sparkle,
  Sparkles,
  Spline,
  SquareDashed,
  Sun,
  SunDim,
  Triangle,
  Type,
  Vibrate,
  Wand2,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

const EFFECT_ICONS: Record<string, LucideIcon> = {
  // animate
  "animate-fade-in": Eye,
  "animate-fade-out": EyeOff,
  "animate-zoom-in": ZoomIn,
  "animate-zoom-out": ZoomOut,
  "animate-pan-left": MoveLeft,
  "animate-pan-right": MoveRight,
  "animate-pulse": Activity,
  "animate-shake": Vibrate,
  // color
  sepia: Coffee,
  mono: Contrast,
  invert: FlipHorizontal2,
  "color-wheels": PaintBucket,
  curves: Spline,
  hsl: Palette,
  lut: Film,
  "power-window": SquareDashed,
  secondary: Pipette,
  // stylize
  snow: Snowflake,
  "light-leak": Sun,
  "scan-lines": Rows3,
  sparkles: Sparkles,
  particles: Wand2,
  blur: Droplet,
  glow: SunDim,
  "film-grain": Grid3x3,
  "chromatic-aberration": Asterisk,
  vignette: Aperture,
  glitch: Zap,
  sharpen: Triangle,
  // key
  "chroma-key": Scissors,
  // composite
  blend: Layers,
  // title
  "title-card": Type,
  // transform
  transform: Move,
  opacity: Eye,
  "mask-rect": SquareDashed,
};

export function effectIcon(kind: string): LucideIcon {
  return EFFECT_ICONS[kind] ?? Sparkle;
}
