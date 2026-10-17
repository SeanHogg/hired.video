/**
 * Linked-content plugin — a user's résumé / job / article / profile /
 * company / video embedded as a card. The DOM mounts the entity's own React
 * renderer (an `embed` op → LinkedContentBody); renderers without React (the
 * export) paint `linkedContentCardOps` from the preloaded summary.
 *
 * The card's CTA links to the entity's public page: emit writes it as
 * `ctaUrl` (absolute, so campaign UTMs bake into it), the playback overlay
 * makes it clickable (`ctaLinkInteractions`, the CTA card's rule) and an
 * export paints the readable link + QR under the card (#2312).
 */
import { CANONICAL_ORIGIN } from "@shared/structured-data";
import type { LinkedContentWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { getLinkedContentMeta, isLinkedContentKind, type LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import { type Box } from "../frame";
import { stringOr } from "@/lib/numeric";
import { registerPlugin } from "../plugin";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, type TextStyle } from "../text-layout";
import { ctaLinkInteractions, linkExportFallback, linkQrPayloads } from "./cta-export-fallback";
import { linkedContentCardOps, linkedContentColors } from "./linked-content-card";
import { fitOneLine, optionalNumber, textLineOps, when } from "./shared";

type LinkedParams = Extract<WidgetParams, { kind: "linked-content" }>;

const OPTIONAL_STRINGS = ["bgColor", "textColor", "mutedColor", "accentColor", "accentTextColor", "ctaText", "ctaFontFamily"] as const;

/** The entity's public page (absolute), or "" for an unbound card. */
export function linkedContentUrl(kind: LinkedContentKind, id: string): string {
  return id ? `${CANONICAL_ORIGIN}${getLinkedContentMeta(kind).viewUrl(id)}` : "";
}

/** Where the card's CTA goes: a render copy's baked link, else the page. */
function ctaLink(data: LinkedContentWidgetParams): string | null {
  return (data.ctaUrl ?? linkedContentUrl(data.entityKind, data.entityId)).trim() || null;
}

/** The export card: the summary card over the area the link line (and QR
 *  column) leave, the readable link along the bottom, then the QR. */
function exportCardOps(data: LinkedContentWidgetParams, content: Box, env: DrawEnv): DrawOp[] | null {
  const pad = Math.round(Math.min(content.w, content.h) * 0.07);
  const fallback = linkExportFallback(ctaLink(data), data.exportFallback !== false, content, pad, env);
  if (!fallback) return null;
  const summary = data.entityId ? env.lookups.linkedContent(data.entityKind, data.entityId) ?? null : null;
  const colors = linkedContentColors(data);
  const linkStyle: TextStyle = { fontPx: Math.max(11, Math.round(Math.min(content.w, content.h) * 0.045)), fontWeight: "normal", fontFamily: env.render.fontFamily };
  const linkH = Math.round(linkStyle.fontPx * 1.3);
  const card: Box = { ...fallback.stack, h: Math.max(0, content.h - linkH - pad) };
  const area: Box = { x: card.x + pad, y: card.y + card.h, w: Math.max(0, card.w - pad * 2), h: linkH };
  const line = fitOneLine(fallback.linkText, area.w, env.measure(fontShorthand(linkStyle)));
  return [
    { op: "rect", box: content, radius: Math.min(24, Math.min(content.w, content.h) * 0.08), fill: colors.bgColor },
    ...linkedContentCardOps(data, summary, card, env),
    ...textLineOps({ area, lines: [line], lineHeightPx: linkH, top: area.y }, linkStyle, colors.mutedColor, "left"),
    ...fallback.qr,
  ];
}

export const linkedContentPlugin = registerPlugin<LinkedParams>({
  effectKind: "canvas-v2:linked-content",
  widgetKinds: ["linked-content"],
  meta: {
    labelKey: "studio.effects.kind.linkedContentCard",
    category: "title",
    defaults: {
      x: 0.15, y: 0.2, width: 0.7, height: 0.6, entityKind: "resume", entityId: "",
      bgColor: "#ffffff", textColor: "#0f172a", mutedColor: "#64748b", accentColor: "#4f46e5", accentTextColor: "#ffffff",
    },
    paramHints: {
      bgColor: { type: "color" },
      textColor: { type: "color" },
      mutedColor: { type: "color" },
      accentColor: { type: "color" },
      accentTextColor: { type: "color" },
    },
  },
  // Theme colours + CTA overrides ride along verbatim, only when set, so a
  // re-opened project keeps the styling the author saw. `ctaUrl` is always
  // the entity's canonical page (derived, never authored).
  emit: (p) => {
    const out: Record<string, unknown> = { entityKind: p.data.entityKind, entityId: p.data.entityId };
    for (const key of OPTIONAL_STRINGS) if (p.data[key] !== undefined) out[key] = p.data[key];
    if (p.data.ctaFontPx !== undefined) out.ctaFontPx = p.data.ctaFontPx;
    if (p.data.ctaFontWeight !== undefined) out.ctaFontWeight = p.data.ctaFontWeight;
    const url = linkedContentUrl(p.data.entityKind, p.data.entityId);
    if (url) out.ctaUrl = url;
    if (p.data.exportFallback === false) out.exportFallback = false;
    return out;
  },
  parse: (raw) => {
    const kindRaw = stringOr(raw.entityKind, "resume");
    const entityKind = isLinkedContentKind(kindRaw) ? kindRaw : "resume";
    const entityId = stringOr(raw.entityId, "");
    const ctaUrl = stringOr(raw.ctaUrl, "");
    const data: LinkedContentWidgetParams = {
      entityKind,
      entityId,
      ...when("ctaFontPx", optionalNumber(raw.ctaFontPx)),
      ...when("ctaFontWeight", raw.ctaFontWeight === "normal" ? ("normal" as const) : raw.ctaFontWeight === "bold" ? ("bold" as const) : undefined),
      // Only a link that differs from the canonical page (a UTM-baked render copy).
      ...when("ctaUrl", ctaUrl && ctaUrl !== linkedContentUrl(entityKind, entityId) ? ctaUrl : undefined),
      ...when("exportFallback", raw.exportFallback === false ? false : undefined),
    };
    for (const key of OPTIONAL_STRINGS) {
      const value = raw[key];
      if (typeof value === "string") data[key] = value;
    }
    return { kind: "linked-content", data };
  },
  draw({ data }, content, env) {
    const exported = exportCardOps(data, content, env);
    if (exported) return [{ op: "embed", embed: "linked-content", box: content, fallback: exported }];
    const summary = data.entityId ? env.lookups.linkedContent(data.entityKind, data.entityId) ?? null : null;
    return [{ op: "embed", embed: "linked-content", box: content, fallback: linkedContentCardOps(data, summary, content, env) }];
  },
  assets: (p) =>
    p.data.entityId
      ? {
          linkedContent: [{ kind: p.data.entityKind, id: p.data.entityId }],
          qrCodes: linkQrPayloads(ctaLink(p.data), p.data.exportFallback !== false),
        }
      : {},
  interactions: ctaLinkInteractions,
});
