/**
 * A tiny software 2D canvas for compositor tests. jsdom has no canvas
 * backend (and the repo doesn't ship the native `canvas` package), so the
 * frame-renderer tests paint into this instead and read REAL pixels back.
 *
 * Supports exactly what the solid-colour compositor path uses: fillStyle
 * (#rrggbb / rgba()), fillRect, clearRect, drawImage (unscaled, integer
 * offset, self-draw safe), globalAlpha, save/restore, get/putImageData.
 * Blending is source-over on unpremultiplied 8-bit RGBA.
 *
 * Deliberately has NO `filter` property — like Safari < 18 — so the scene
 * filter effect takes its pixel-math path and the result is checkable.
 */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(input: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(input.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(input.replace(/\s+/g, ""));
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",");
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`PixelCanvas: unsupported colour ${input}`);
}

export class PixelCanvas {
  private w: number;
  private h: number;
  data: Uint8ClampedArray;
  private readonly ctx: PixelContext;

  constructor(width: number, height: number) {
    this.w = width;
    this.h = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.ctx = new PixelContext(this);
  }

  get width(): number {
    return this.w;
  }
  set width(v: number) {
    this.w = v;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height(): number {
    return this.h;
  }
  set height(v: number) {
    this.h = v;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }

  getContext(_type: "2d"): PixelContext {
    return this.ctx;
  }

  pixel(x: number, y: number): [number, number, number, number] {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
}

export class PixelContext {
  fillStyle = "#000000";
  globalAlpha = 1;
  private stack: Array<{ fillStyle: string; globalAlpha: number }> = [];

  constructor(readonly canvas: PixelCanvas) {}

  save(): void {
    this.stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
  }

  restore(): void {
    const top = this.stack.pop();
    if (top) Object.assign(this, top);
  }

  private blend(i: number, r: number, g: number, b: number, a: number): void {
    const d = this.canvas.data;
    const dA = d[i + 3] / 255;
    const outA = a + dA * (1 - a);
    if (outA <= 0) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
      return;
    }
    d[i] = (r * a + d[i] * dA * (1 - a)) / outA;
    d[i + 1] = (g * a + d[i + 1] * dA * (1 - a)) / outA;
    d[i + 2] = (b * a + d[i + 2] * dA * (1 - a)) / outA;
    d[i + 3] = outA * 255;
  }

  private eachPixel(x: number, y: number, w: number, h: number, fn: (i: number, px: number, py: number) => void): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.canvas.width, Math.round(x + w));
    const y1 = Math.min(this.canvas.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) fn((py * this.canvas.width + px) * 4, px, py);
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const c = parseColor(this.fillStyle);
    const a = c.a * this.globalAlpha;
    this.eachPixel(x, y, w, h, (i) => this.blend(i, c.r, c.g, c.b, a));
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const d = this.canvas.data;
    this.eachPixel(x, y, w, h, (i) => {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    });
  }

  drawImage(src: PixelCanvas, dx: number, dy: number, dw?: number, dh?: number): void {
    if ((dw !== undefined && dw !== src.width) || (dh !== undefined && dh !== src.height)) {
      throw new Error("PixelCanvas: scaled drawImage is not supported");
    }
    // Copy first so drawing a canvas onto itself is well defined.
    const pixels = src.data.slice();
    const ox = Math.round(dx);
    const oy = Math.round(dy);
    this.eachPixel(ox, oy, src.width, src.height, (i, px, py) => {
      const s = ((py - oy) * src.width + (px - ox)) * 4;
      this.blend(i, pixels[s], pixels[s + 1], pixels[s + 2], (pixels[s + 3] / 255) * this.globalAlpha);
    });
  }

  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    if (x !== 0 || y !== 0 || w !== this.canvas.width || h !== this.canvas.height) {
      throw new Error("PixelCanvas: partial getImageData is not supported");
    }
    return { data: this.canvas.data.slice(), width: w, height: h };
  }

  putImageData(image: { data: Uint8ClampedArray }, x: number, y: number): void {
    if (x !== 0 || y !== 0) throw new Error("PixelCanvas: offset putImageData is not supported");
    this.canvas.data.set(image.data);
  }
}
