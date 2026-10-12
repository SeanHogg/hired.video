/** Brand-kit plugin (#577 / gap #3069) — paints the selected kit's
 *  logo on preview + export. Distinct from the hired.video product
 *  watermark (`lib/timeline/watermark.ts` / BrandWatermark).
 *  Kind logic lives here (`canvas-v2:brand`); canvas-v2.ts stays
 *  kind-agnostic (#2312). */
import type { WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { registerPlugin } from "../plugin";
import { mediaPlaceholderOps } from "./media-placeholder";
import { optionalNumber, optionalString, when } from "./shared";

type BrandParams = Extract<WidgetParams, { kind: "brand-kit" }>;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export const brandKitPlugin = registerPlugin<BrandParams>({
  effectKind: "canvas-v2:brand",
  widgetKinds: ["brand-kit"],
  meta: {
    labelKey: "studio.layout.brandKitsTitle",
    category: "transform",
    defaults: {
      x: 0.84,
      y: 0.84,
      width: 0.12,
      height: 0.12,
      brandKitId: "",
      logoUrl: "",
      opacity: 1,
    },
  },
  emit: (p) => ({
    ...when("brandKitId", optionalString(p.data.brandKitId)),
    ...when("logoUrl", optionalString(p.data.logoUrl)),
    ...when("opacity", optionalNumber(p.data.opacity)),
  }),
  parse: (raw) => ({
    kind: "brand-kit",
    data: {
      brandKitId: optionalString(raw.brandKitId) ?? "",
      logoUrl: optionalString(raw.logoUrl) ?? "",
      opacity: clamp01(optionalNumber(raw.opacity) ?? 1),
    },
  }),
  draw({ data }, content, env) {
    if (!data.logoUrl) {
      return mediaPlaceholderOps(content, env, "headings.pitchDeck.pickBrandKit", true);
    }
    return [
      {
        op: "media",
        media: "image",
        url: data.logoUrl,
        box: content,
        fit: "contain",
        alpha: data.opacity,
      },
    ];
  },
  assets: (p) => (p.data.logoUrl ? { images: [p.data.logoUrl] } : {}),
});
