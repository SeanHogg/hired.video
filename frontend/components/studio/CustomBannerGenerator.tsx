// CustomBannerGenerator.tsx — reusable client-side banner/image generator.
//
// Renders an SVG layout into an offscreen <canvas>, optionally composites the
// hired.video logo, and returns a PNG data URL the caller drops into an
// ImageElement.url. Opens as a side-panel Sheet over the studio.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// ─── Presets ────────────────────────────────────────────────────────────────

interface SizePreset {
  value: string;
  labelKey: string;
  w: number;
  h: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { value: "wide-16x9",     labelKey: "studio.banner.size.wide16x9",     w: 1920, h: 1080 },
  { value: "youtube",       labelKey: "studio.banner.size.youtube",      w: 2048, h: 1152 },
  { value: "square",        labelKey: "studio.banner.size.square",       w: 1080, h: 1080 },
  { value: "portrait-9x16", labelKey: "studio.banner.size.portrait9x16", w: 1080, h: 1920 },
  { value: "linkedin",      labelKey: "studio.banner.size.linkedin",     w: 1584, h: 396  },
];

interface ThemePreset {
  value: string;
  labelKey: string;
  bg: [string, string, string]; // gradient stops
  accent: [string, string];
  text: string;
  muted: string;
  pill: string; // rgba for pill bg
}

const THEMES: ThemePreset[] = [
  {
    value: "brand",
    labelKey: "studio.banner.theme.brand",
    bg: ["#0f0a2b", "#3b2098", "#3b82f6"],
    accent: ["#a78bfa", "#60a5fa"],
    text: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    pill: "rgba(255,255,255,0.14)",
  },
  {
    value: "sunset",
    labelKey: "studio.banner.theme.sunset",
    bg: ["#1a0b2e", "#7c2d12", "#f97316"],
    accent: ["#fbbf24", "#f472b6"],
    text: "#ffffff",
    muted: "rgba(255,255,255,0.82)",
    pill: "rgba(255,255,255,0.16)",
  },
  {
    value: "forest",
    labelKey: "studio.banner.theme.forest",
    bg: ["#022c22", "#065f46", "#14b8a6"],
    accent: ["#a7f3d0", "#5eead4"],
    text: "#ffffff",
    muted: "rgba(255,255,255,0.82)",
    pill: "rgba(255,255,255,0.14)",
  },
  {
    value: "mono",
    labelKey: "studio.banner.theme.mono",
    bg: ["#0a0a0a", "#171717", "#262626"],
    accent: ["#a3a3a3", "#e5e5e5"],
    text: "#ffffff",
    muted: "rgba(255,255,255,0.7)",
    pill: "rgba(255,255,255,0.10)",
  },
  {
    value: "light",
    labelKey: "studio.banner.theme.light",
    bg: ["#f5f3ff", "#ede9fe", "#dbeafe"],
    accent: ["#7c3aed", "#3b82f6"],
    text: "#1e1b4b",
    muted: "rgba(30,27,75,0.7)",
    pill: "rgba(124,58,237,0.10)",
  },
];

const LOGO_URL = "/pwa-512x512.png";

// ─── SVG builder ────────────────────────────────────────────────────────────

interface BannerSpec {
  w: number;
  h: number;
  theme: ThemePreset;
  eyebrow: string;
  headline: string;
  subhead: string;
  showPills: boolean;
  pills: string[];
}

function buildSvg(spec: BannerSpec): string {
  const { w, h, theme, eyebrow, headline, subhead, showPills, pills } = spec;

  // Type scale relative to the shorter dimension so the banner reads well at
  // any aspect (very wide LinkedIn covers vs square posts).
  const base = Math.min(w, h);
  const eyebrowSize = Math.round(base * 0.028);
  const headlineSize = Math.round(base * 0.11);
  const subheadSize = Math.round(base * 0.038);
  const pillSize = Math.round(base * 0.022);
  const pad = Math.round(Math.min(w, h) * 0.07);

  // Layout: text stacked left in the central safe band; logo lives in the
  // bottom-right corner of the canvas itself (composited later).
  const textX = pad;
  const textY = h * 0.42;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const pillsSvg = showPills && pills.length > 0
    ? `<g transform="translate(${textX}, ${textY + headlineSize * 0.7 + subheadSize * 1.4})">
        ${pills.slice(0, 4).map((p, i) => {
          const pillPadX = Math.round(pillSize * 1.1);
          const pillH = Math.round(pillSize * 2.2);
          const approxWidth = Math.round(p.length * pillSize * 0.55) + pillPadX * 2;
          const xOffset = i * (approxWidth + Math.round(pillSize * 0.6));
          return `<g transform="translate(${xOffset}, 0)">
            <rect x="0" y="0" width="${approxWidth}" height="${pillH}" rx="${pillH / 2}" fill="${theme.pill}"/>
            <text x="${approxWidth / 2}" y="${pillH * 0.66}" text-anchor="middle"
                  font-family="Segoe UI, system-ui, -apple-system, sans-serif"
                  font-size="${pillSize}" font-weight="600" fill="${theme.text}">${escape(p)}</text>
          </g>`;
        }).join("")}
      </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"  stop-color="${theme.bg[0]}"/>
        <stop offset="50%" stop-color="${theme.bg[1]}"/>
        <stop offset="100%" stop-color="${theme.bg[2]}"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"  stop-color="${theme.accent[0]}"/>
        <stop offset="100%" stop-color="${theme.accent[1]}"/>
      </linearGradient>
      <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${theme.accent[0]}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${theme.accent[0]}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${theme.accent[1]}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${theme.accent[1]}" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <circle cx="${w * 0.15}" cy="${h * 0.2}"  r="${base * 0.45}" fill="url(#glow1)"/>
    <circle cx="${w * 0.85}" cy="${h * 0.85}" r="${base * 0.55}" fill="url(#glow2)"/>

    ${eyebrow.trim() ? `<text x="${textX}" y="${textY - headlineSize * 0.6}"
          font-family="Segoe UI, system-ui, -apple-system, sans-serif"
          font-size="${eyebrowSize}" font-weight="600" letter-spacing="${Math.round(eyebrowSize * 0.2)}"
          fill="url(#accent)">${escape(eyebrow.toUpperCase())}</text>` : ""}

    <text x="${textX}" y="${textY + headlineSize * 0.1}"
          font-family="Segoe UI, system-ui, -apple-system, sans-serif"
          font-size="${headlineSize}" font-weight="800" letter-spacing="-2"
          fill="${theme.text}">${escape(headline)}</text>

    ${subhead.trim() ? `<text x="${textX}" y="${textY + headlineSize * 0.7 + subheadSize}"
          font-family="Segoe UI, system-ui, -apple-system, sans-serif"
          font-size="${subheadSize}" font-weight="500"
          fill="${theme.muted}">${escape(subhead)}</text>` : ""}

    ${pillsSvg}
  </svg>`;
}

// ─── Browser SVG → PNG renderer ─────────────────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

interface RenderArgs {
  spec: BannerSpec;
  showLogo: boolean;
}

async function renderToCanvas(canvas: HTMLCanvasElement, { spec, showLogo }: RenderArgs): Promise<void> {
  const { w, h } = spec;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // SVG → data URL → Image. Same-origin data URLs do not taint the canvas.
  const svg = buildSvg(spec);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const bg = await loadImage(svgUrl);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bg, 0, 0, w, h);

  if (showLogo) {
    try {
      const logo = await loadImage(LOGO_URL);
      // Card behind logo so its transparent interior reads against any gradient.
      const base = Math.min(w, h);
      const logoSize = Math.round(base * 0.28);
      const cardPadInner = Math.round(logoSize * 0.13);
      const cardSize = logoSize + cardPadInner * 2;
      const cornerPad = Math.round(base * 0.05);
      const cardX = w - cardSize - cornerPad;
      const cardY = h - cardSize - cornerPad;
      const radius = Math.round(cardSize * 0.14);

      // Drop shadow card.
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = Math.round(base * 0.025);
      ctx.shadowOffsetY = Math.round(base * 0.012);
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, cardX, cardY, cardSize, cardSize, radius);
      ctx.fill();
      ctx.restore();

      ctx.drawImage(logo, cardX + cardPadInner, cardY + cardPadInner, logoSize, logoSize);
    } catch {
      // logo load failed — skip silently, banner still produced
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface CustomBannerGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a PNG data URL when the user inserts the banner. */
  onGenerated: (dataUrl: string) => void;
  /** Optional initial values from the calling context. */
  initialHeadline?: string;
  initialSubhead?: string;
  /** Aspect of the scene element that triggered this — used for "Fit scene". */
  sceneBoxAspect?: number;
}

export function CustomBannerGenerator({
  open, onOpenChange, onGenerated,
  initialHeadline = "", initialSubhead = "", sceneBoxAspect,
}: CustomBannerGeneratorProps) {
  const { t } = useTranslation();
  const [sizeKey, setSizeKey] = useState<string>(sceneBoxAspect ? "scene" : "wide-16x9");
  const [themeKey, setThemeKey] = useState<string>("brand");
  const [eyebrow, setEyebrow] = useState<string>("");
  const [headline, setHeadline] = useState<string>(initialHeadline || t("studio.banner.defaultHeadline"));
  const [subhead, setSubhead] = useState<string>(initialSubhead);
  const [pillsRaw, setPillsRaw] = useState<string>("");
  const [showPills, setShowPills] = useState<boolean>(false);
  const [showLogo, setShowLogo] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [inserting, setInserting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Stale-render guard: ignore older async renders if inputs changed.
  const renderSeq = useRef<number>(0);

  const sizes = useMemo<SizePreset[]>(() => {
    if (sceneBoxAspect && sceneBoxAspect > 0) {
      // Add a "Fit scene" preset sized to the element box's aspect at ~1080 short side.
      const a = sceneBoxAspect;
      const h = a >= 1 ? 1080 : Math.round(1080 / a);
      const w = a >= 1 ? Math.round(1080 * a) : 1080;
      return [{ value: "scene", labelKey: "studio.banner.size.fitScene", w, h }, ...SIZE_PRESETS];
    }
    return SIZE_PRESETS;
  }, [sceneBoxAspect]);

  const size = sizes.find((s) => s.value === sizeKey) ?? sizes[0];
  const theme = THEMES.find((th) => th.value === themeKey) ?? THEMES[0];
  const pills = pillsRaw.split(",").map((p) => p.trim()).filter(Boolean);

  const spec: BannerSpec = useMemo(() => ({
    w: size.w, h: size.h, theme,
    eyebrow, headline, subhead,
    showPills, pills,
  }), [size, theme, eyebrow, headline, subhead, showPills, pills]);

  // Re-render preview on any input change (debounced via the seq counter).
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const seq = ++renderSeq.current;
    setRendering(true);
    setError(null);
    void renderToCanvas(canvas, { spec, showLogo })
      .catch((e) => { if (seq === renderSeq.current) setError(String(e)); })
      .finally(() => { if (seq === renderSeq.current) setRendering(false); });
  }, [open, spec, showLogo]);

  async function handleInsert(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setInserting(true);
    try {
      // Re-render once at full resolution to ensure the latest state is captured.
      await renderToCanvas(canvas, { spec, showLogo });
      const dataUrl = canvas.toDataURL("image/png");
      onGenerated(dataUrl);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setInserting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            {t("studio.banner.heading")}
          </SheetTitle>
          <SheetDescription>
            {t("studio.banner.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Live preview */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="aspect-video w-full overflow-hidden rounded bg-black/40 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-full"
                style={{ aspectRatio: `${size.w} / ${size.h}` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{size.w} × {size.h}</span>
              {rendering && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t("studio.banner.rendering")}</span>}
            </div>
          </div>

          {/* Size + theme */}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("studio.banner.sizeLabel")}</Label>
              <select
                value={sizeKey}
                onChange={(e) => setSizeKey(e.target.value)}
                className="w-full h-8 text-xs rounded border border-border bg-transparent px-2"
              >
                {sizes.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey)} ({s.w}×{s.h})</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("studio.banner.themeLabel")}</Label>
              <select
                value={themeKey}
                onChange={(e) => setThemeKey(e.target.value)}
                className="w-full h-8 text-xs rounded border border-border bg-transparent px-2"
              >
                {THEMES.map((th) => <option key={th.value} value={th.value}>{t(th.labelKey)}</option>)}
              </select>
            </label>
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <label className="space-y-1 block">
              <Label className="text-[11px] text-muted-foreground">{t("studio.banner.eyebrowLabel")}</Label>
              <Input
                value={eyebrow}
                onChange={(e) => setEyebrow(e.target.value)}
                placeholder={t("studio.banner.eyebrowPlaceholder")}
                className="h-8 text-xs"
              />
            </label>
            <label className="space-y-1 block">
              <Label className="text-[11px] text-muted-foreground">{t("studio.banner.headlineLabel")}</Label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="hired.video"
                className="h-8 text-xs"
              />
            </label>
            <label className="space-y-1 block">
              <Label className="text-[11px] text-muted-foreground">{t("studio.banner.subheadLabel")}</Label>
              <Input
                value={subhead}
                onChange={(e) => setSubhead(e.target.value)}
                placeholder={t("studio.banner.subheadPlaceholder")}
                className="h-8 text-xs"
              />
            </label>
          </div>

          {/* Toggles + pills */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> {t("studio.banner.showLogo")}
              </Label>
              <Switch checked={showLogo} onCheckedChange={setShowLogo} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("studio.banner.showPills")}</Label>
              <Switch checked={showPills} onCheckedChange={setShowPills} />
            </div>
            {showPills && (
              <Input
                value={pillsRaw}
                onChange={(e) => setPillsRaw(e.target.value)}
                placeholder={t("studio.banner.pillsPlaceholder")}
                className="h-8 text-xs"
              />
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("actions.cancel")}</Button>
            <Button onClick={handleInsert} disabled={inserting || !headline.trim()}>
              {inserting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t("studio.banner.insert")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
