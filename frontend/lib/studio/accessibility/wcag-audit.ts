/**
 * WCAG 2.2 audit for Studio output (#1556).
 *
 * Pure function — takes the live `CanvasState` and returns an ordered
 * list of accessibility issues. The Studio Accessibility Panel renders
 * this list in-editor so the author can fix problems *before* publish,
 * closing the gap vs Articulate 360's accessibility tooling.
 *
 * What we check (today):
 *   1. **Alt text on images** (WCAG 1.1.1 Non-text Content). Image
 *      widgets without an `altText` are flagged.
 *   2. **Text contrast** (WCAG 1.4.3 / 1.4.6 — AA / AAA). Text +
 *      heading + chips + CTA + caption-box widgets are checked against
 *      their effective background (container fill > scene background).
 *   3. **Captions on video** (WCAG 1.2.2 Captions, prerecorded). If
 *      the project has video widgets or voiceover audio but no caption
 *      cues, the audit flags the missing track.
 *   4. **Reading order** (WCAG 1.3.2 Meaningful Sequence). Widgets are
 *      compared against a top-to-bottom / left-to-right reading order;
 *      large z-index inversions (a header drawn after body copy with no
 *      visible reason) get flagged as a warning.
 *
 * Future checks tracked in the gap register:
 *   - Audio descriptions for visual-only content (WCAG 1.2.5).
 *   - Animation-with-flashing-content threshold (WCAG 2.3.1).
 *   - Sign-language alternative (WCAG 1.2.6).
 */

import type {
  CanvasState,
  Scene,
  Widget,
} from "../editor-v2/canvas-state";
import { voiceoverLayers } from "../editor-v2/canvas-state";
import { evaluateContrast } from "./contrast";

export type WcagSeverity = "error" | "warning" | "info";

export type WcagRule =
  | "alt-text-missing"
  | "contrast-aa-fail"
  | "contrast-aaa-fail"
  | "captions-missing"
  | "reading-order"
  | "tiny-text"
  | "untrimmed-decoration";

export interface WcagIssue {
  rule: WcagRule;
  severity: WcagSeverity;
  /** WCAG success criterion this maps to (e.g. "1.1.1"). */
  sc: string;
  message: string;
  /** Click-target — `sceneId` always present; `widgetId` set when the
   *  issue is bound to a specific widget so the inspector can scroll to
   *  it. */
  sceneId: string;
  widgetId?: string;
  /** One-line author guidance. */
  fix: string;
}

export interface WcagSummary {
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

export interface WcagReport {
  issues: WcagIssue[];
  summary: WcagSummary;
}

export function auditCanvasState(state: CanvasState): WcagReport {
  const issues: WcagIssue[] = [];

  // 3 — captions / audio-description. Project-level, not per-scene.
  const hasAnyVideo = state.scenes.some((s) =>
    s.widgets.some((w) => w.kind === "video" || w.kind === "webcam"),
  );
  const hasAnyVoiceover = voiceoverLayers(state).length > 0;
  const hasCaptions =
    state.captions !== null && state.captions.cues.length > 0;
  if ((hasAnyVideo || hasAnyVoiceover) && !hasCaptions) {
    issues.push({
      rule: "captions-missing",
      severity: "error",
      sc: "1.2.2",
      message:
        "Project has video or voiceover audio but no caption track. Viewers who are deaf or hard-of-hearing can't follow the dialogue.",
      sceneId: state.scenes[0]?.id ?? "",
      fix: "Open the Captions dialog (Engagement → Captions) — auto-generate from voiceover or paste your script.",
    });
  }

  for (const scene of state.scenes) {
    auditScene(state, scene, issues);
  }

  const summary: WcagSummary = {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
    total: issues.length,
  };
  return { issues, summary };
}

function auditScene(state: CanvasState, scene: Scene, issues: WcagIssue[]): void {
  for (const widget of scene.widgets) {
    auditWidget(state, scene, widget, issues);
  }

  // 4 — reading-order check. We compare the z-ordered widget sequence
  // against the natural top-to-bottom / left-to-right reading order.
  // A meaningful mismatch (z says "draw heading last" but reading order
  // puts it first) suggests the author should re-stack so the
  // semantic order matches the visual order — assistive tech that walks
  // the canvas DOM in DOM order will otherwise read the scene
  // backwards.
  if (scene.widgets.length >= 3) {
    const headings = scene.widgets.filter(
      (w) => w.kind === "heading" || w.kind === "text",
    );
    if (headings.length >= 2) {
      const sortedByZ = [...headings].sort(
        (a, b) => a.position.z - b.position.z,
      );
      const sortedByReadingOrder = [...headings].sort((a, b) => {
        const ay = a.position.y;
        const by = b.position.y;
        // Group rows within 5% of canvas height.
        if (Math.abs(ay - by) < 0.05) return a.position.x - b.position.x;
        return ay - by;
      });
      let inversions = 0;
      for (let i = 0; i < sortedByZ.length; i++) {
        if (sortedByZ[i].id !== sortedByReadingOrder[i].id) inversions++;
      }
      if (inversions >= 2) {
        issues.push({
          rule: "reading-order",
          severity: "warning",
          sc: "1.3.2",
          message: `Scene "${scene.label}" has ${inversions} text widget(s) whose z-order doesn't match top-to-bottom / left-to-right reading order. Assistive tech may read the scene out of sequence.`,
          sceneId: scene.id,
          fix: "Re-stack widgets in the Layers panel so the order matches the visual reading order, or split the text into separate scenes.",
        });
      }
    }
  }
}

function auditWidget(
  state: CanvasState,
  scene: Scene,
  widget: Widget,
  issues: WcagIssue[],
): void {
  // 1 — Alt text on images.
  if (widget.kind === "image") {
    // ImageWidgetParams doesn't carry an alt field today — that's the
    // gap. Any image widget that lives in a scene without a sibling
    // text widget describing it gets flagged. (The widget's own
    // params.altText is read with a safety cast so this audit keeps
    // working once #1557 lands the field on the schema.)
    const params = widget.params as { data?: { altText?: string } };
    const hasAlt =
      typeof params?.data?.altText === "string" &&
      params.data.altText.trim().length > 0;
    if (!hasAlt) {
      issues.push({
        rule: "alt-text-missing",
        severity: "error",
        sc: "1.1.1",
        message: `Image widget in "${scene.label}" has no alternative text. Screen readers will announce it as "image" with no context.`,
        sceneId: scene.id,
        widgetId: widget.id,
        fix: "Open the image widget's inspector → fill in the Alt text field (1 short sentence describing what the image conveys).",
      });
    }
  }

  // 2 — Contrast on text-bearing widgets.
  const textColorAndSize = extractTextColorAndSize(widget);
  if (textColorAndSize) {
    const bgColor = resolveBackgroundColor(scene, widget);
    const result = evaluateContrast(textColorAndSize.color, bgColor, {
      fontPx: textColorAndSize.fontPx,
      bold: textColorAndSize.bold,
    });
    if (!result.passesAALarge) {
      issues.push({
        rule: "contrast-aa-fail",
        severity: "error",
        sc: "1.4.3",
        message: `Text in "${scene.label}" has contrast ratio ${result.ratio.toFixed(2)}:1 against its background — fails WCAG 2.2 AA (4.5:1 normal / 3:1 large).`,
        sceneId: scene.id,
        widgetId: widget.id,
        fix: "Pick a darker text colour or a lighter background — the Design panel's palette picker shows the contrast ratio under each swatch.",
      });
    } else if (!result.passesAA) {
      issues.push({
        rule: "contrast-aa-fail",
        severity: "warning",
        sc: "1.4.3",
        message: `Text in "${scene.label}" passes AA-large only (${result.ratio.toFixed(2)}:1). At smaller sizes the same combo would fail.`,
        sceneId: scene.id,
        widgetId: widget.id,
        fix: "Either lift to ≥18pt regular / ≥14pt bold OR adjust colours to clear 4.5:1.",
      });
    } else if (!result.passesAAA) {
      issues.push({
        rule: "contrast-aaa-fail",
        severity: "info",
        sc: "1.4.6",
        message: `Text in "${scene.label}" passes AA (${result.ratio.toFixed(2)}:1) but not AAA (7:1). Acceptable for most contexts; required for governmental / financial / health-care contexts.`,
        sceneId: scene.id,
        widgetId: widget.id,
        fix: "Optional — bump the contrast if you're publishing to a regulated audience.",
      });
    }

    // 6 — tiny text (WCAG 1.4.4 Resize Text — flags <12px as unfriendly
    // even at high pixel density).
    if (textColorAndSize.fontPx < 12) {
      issues.push({
        rule: "tiny-text",
        severity: "warning",
        sc: "1.4.4",
        message: `Text in "${scene.label}" is ${textColorAndSize.fontPx}px — below the 12px floor most screen-magnifier users can read.`,
        sceneId: scene.id,
        widgetId: widget.id,
        fix: "Lift the widget's font size to ≥14px (≥16px for body copy).",
      });
    }
  }
}

interface TextStyleProbe {
  color: string;
  fontPx: number;
  bold?: boolean;
}

function extractTextColorAndSize(widget: Widget): TextStyleProbe | null {
  switch (widget.kind) {
    case "text":
    case "heading": {
      const d = (widget.params as { data: { color: string; fontPx: number; fontWeight: string } })
        .data;
      return { color: d.color, fontPx: d.fontPx, bold: d.fontWeight === "bold" };
    }
    case "chips": {
      const d = (widget.params as { data: { textColor: string; fontPx: number } }).data;
      return { color: d.textColor, fontPx: d.fontPx };
    }
    case "cta": {
      const d = (widget.params as { data: { textColor: string; cardFontPx?: number } }).data;
      return { color: d.textColor, fontPx: d.cardFontPx ?? 24 };
    }
    case "caption-box": {
      const d = (widget.params as { data: { color: string; fontPx: number } }).data;
      return { color: d.color, fontPx: d.fontPx };
    }
    case "speech-bubble": {
      const d = (widget.params as { data: { color: string; fontPx: number } }).data;
      return { color: d.color, fontPx: d.fontPx };
    }
    case "sfx-burst": {
      const d = (widget.params as { data: { color: string; fontPx: number } }).data;
      return { color: d.color, fontPx: d.fontPx };
    }
    default:
      return null;
  }
}

function resolveBackgroundColor(scene: Scene, widget: Widget): string {
  // Container fill takes priority over the scene background — the text
  // sits on its own container chrome when one is set.
  if (widget.containerStyle?.backgroundColor) {
    return widget.containerStyle.backgroundColor;
  }
  // Text + speech-bubble + chips + cta carry their own bg field that
  // overrides the scene fill — read it when present. Cast via `unknown`
  // because `widget.params.data` is a discriminated union and the
  // individual `*WidgetParams` shapes don't carry an index signature.
  const data = (widget.params.data ?? {}) as unknown as Record<string, unknown>;
  for (const key of ["bgColor", "background", "chipColor"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return scene.backgroundColor;
}
