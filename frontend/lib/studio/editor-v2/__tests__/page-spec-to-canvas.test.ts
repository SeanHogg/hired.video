/**
 * page→video spec → CanvasState hydrator tests (#1867).
 *
 * `pageVideoSpecToCanvas()` decides the deterministic per-scene-kind
 * layout so an AI-built draft opens looking like a polished template.
 * These tests pin that contract: dimensions per aspect, one scene per
 * spec scene, and the right widget kinds + content per scene kind.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/page-spec-to-canvas.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  PAGE_VIDEO_DEFAULT_PALETTE,
  type PageVideoSpec,
  type PageVideoScene,
} from "@shared/page-video-spec";
import { pageVideoSpecToCanvas } from "../page-spec-to-canvas";

function scene(over: Partial<PageVideoScene> & { kind: PageVideoScene["kind"] }): PageVideoScene {
  return {
    label: "L",
    headline: "Headline",
    subhead: "",
    bullets: [],
    stat: "",
    statCaption: "",
    imageUrl: null,
    ctaText: "",
    ctaUrl: "",
    narration: "",
    durationSeconds: 5,
    ...over,
  };
}

function spec(scenes: PageVideoScene[], aspect: PageVideoSpec["aspect"] = "portrait"): PageVideoSpec {
  return { title: "T", palette: PAGE_VIDEO_DEFAULT_PALETTE, aspect, scenes };
}

describe("pageVideoSpecToCanvas()", () => {
  it("maps aspect → canvas dimensions", () => {
    expect(pageVideoSpecToCanvas(spec([scene({ kind: "hook" })], "portrait"))).toMatchObject({ width: 1080, height: 1920 });
    expect(pageVideoSpecToCanvas(spec([scene({ kind: "hook" })], "landscape"))).toMatchObject({ width: 1920, height: 1080 });
    expect(pageVideoSpecToCanvas(spec([scene({ kind: "hook" })], "square"))).toMatchObject({ width: 1080, height: 1080 });
  });

  it("produces one scene per spec scene and a 4-slot palette tuple", () => {
    const canvas = pageVideoSpecToCanvas(spec([scene({ kind: "hook" }), scene({ kind: "cta" })]));
    expect(canvas.scenes).toHaveLength(2);
    expect(canvas.colorPalette).toHaveLength(4);
  });

  it("seeds a pending-synthesis voiceover clip per narrated scene, anchored to it", () => {
    const canvas = pageVideoSpecToCanvas(
      spec([
        scene({ kind: "hook", narration: "Stop scrolling — this changes hiring." }),
        scene({ kind: "point", narration: "" }), // silent → no clip
        scene({ kind: "cta", narration: "Start free today." }),
      ]),
    );
    expect(canvas.voiceovers).toHaveLength(2);
    // Each clip carries its script, has no url yet, and anchors to its scene.
    expect(canvas.voiceovers[0]).toMatchObject({
      text: "Stop scrolling — this changes hiring.",
      url: "",
      anchorSceneId: canvas.scenes[0].id,
    });
    expect(canvas.voiceovers[1]).toMatchObject({
      text: "Start free today.",
      anchorSceneId: canvas.scenes[2].id,
    });
  });

  it("renders the hook headline as a heading widget", () => {
    const canvas = pageVideoSpecToCanvas(spec([scene({ kind: "hook", headline: "Get hired faster" })]));
    const widgets = canvas.scenes[0].widgets;
    const heading = widgets.find((w) => w.kind === "heading");
    expect(heading).toBeTruthy();
    expect(heading?.params).toMatchObject({ data: { text: "Get hired faster" } });
  });

  it("renders point bullets as a bulleted text widget", () => {
    const canvas = pageVideoSpecToCanvas(spec([scene({ kind: "point", bullets: ["A", "B"] })]));
    const texts = canvas.scenes[0].widgets.filter((w) => w.kind === "text");
    const bulletWidget = texts.find(
      (w) => w.params.kind === "text" && w.params.data.text.includes("•") && w.params.data.text.includes("A"),
    );
    expect(bulletWidget).toBeTruthy();
  });

  it("renders an image widget with a url source when imageUrl is set", () => {
    const canvas = pageVideoSpecToCanvas(spec([scene({ kind: "point", imageUrl: "https://cdn/x.png" })]));
    const img = canvas.scenes[0].widgets.find((w) => w.kind === "image");
    expect(img?.params).toMatchObject({ data: { source: { kind: "url", url: "https://cdn/x.png" } } });
  });

  it("renders a cta widget carrying the button label + url", () => {
    const canvas = pageVideoSpecToCanvas(
      spec([scene({ kind: "cta", headline: "Ready?", ctaText: "Start free", ctaUrl: "https://h/signup" })]),
    );
    const cta = canvas.scenes[0].widgets.find((w) => w.kind === "cta");
    expect(cta?.params).toMatchObject({ data: { ctaText: "Start free", ctaUrl: "https://h/signup" } });
  });

  it("renders the stat figure as its own widget", () => {
    const canvas = pageVideoSpecToCanvas(spec([scene({ kind: "stat", stat: "1M tokens", statCaption: "per month" })]));
    const texts = canvas.scenes[0].widgets;
    expect(texts.some((w) => (w.params.kind === "heading" || w.params.kind === "text") && w.params.data.text === "1M tokens")).toBe(true);
  });
});
